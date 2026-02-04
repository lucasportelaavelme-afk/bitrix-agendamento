export default function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Agendar</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    .box { border: 1px solid #ddd; border-radius: 10px; padding: 14px; max-width: 760px; }
    .ok { color: #0a7; }
    .err { color: #b00; }
    label { display:block; margin-top: 10px; font-weight: 600; }
    input, select, button, textarea { width: 100%; padding: 10px; margin-top: 6px; box-sizing: border-box; }
    button { cursor: pointer; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .hint { font-size: 12px; color: #555; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Agendar reunião</h2>
    <div id="status">Carregando…</div>

    <label>Link do Negócio (cole a URL do card)</label>
    <input id="dealLink" type="url" placeholder="https://b24-.../crm/deal/details/1234/" />
    <div class="hint">Sem esse link, o app cria só o evento no calendário (não cria o To-do no Negócio).</div>

    <div class="row">
      <div>
        <label>Tipo</label>
        <select id="tipo">
          <option value="R1">R1</option>
          <option value="R2">R2</option>
          <option value="RA">RA</option>
          <option value="Delay R1">Delay R1</option>
          <option value="Delay R2">Delay R2</option>
        </select>
      </div>
      <div>
        <label>Duração (min)</label>
        <input id="duracao" type="number" value="60" min="15" step="15" />
      </div>
    </div>

    <label>Data e hora (início) — 15 em 15 min</label>
    <input id="inicio" type="datetime-local" step="900" />
    <div class="hint">O app ajusta automaticamente para o próximo intervalo de 15 minutos.</div>

    <label>Observações (opcional)</label>
    <textarea id="obs" rows="3" placeholder="Ex: pauta, contexto, etc."></textarea>

    <button id="criar" disabled>Criar (Calendário + To-do no Negócio)</button>

    <div class="hint">
      Cria evento no calendário do Bitrix e cria um To-do no timeline do Negócio.
    </div>
  </div>

  <script src="https://api.bitrix24.com/api/v1/"></script>
  <script>
    const statusEl = document.getElementById("status");
    const btnCriar = document.getElementById("criar");

    const dealLinkEl = document.getElementById("dealLink");
    const inicioEl = document.getElementById("inicio");

    let currentUserId = null;

    function setStatus(msg, cls) {
      statusEl.className = cls || "";
      statusEl.textContent = msg;
    }

    function call(method, params) {
      return new Promise((resolve, reject) => {
        BX24.callMethod(method, params, (res) => {
          if (res.error()) reject(new Error(res.error()));
          else resolve(res.data());
        });
      });
    }

    function addMinutes(date, mins) {
      return new Date(date.getTime() + mins * 60000);
    }

    function extractDealIdFromLink(url) {
      try {
        const m =
          String(url).match(/\\/deal\\/details\\/(\\d+)\\//i) ||
          String(url).match(/\\/deal\\/details\\/(\\d+)/i);
        return m ? Number(m[1]) : null;
      } catch {
        return null;
      }
    }

    // Bitrix: YYYY-MM-DD HH:MM:SS (hora local)
    function pad(n) { return String(n).padStart(2, "0"); }
    function toBitrixDateTime(d) {
      return (
        d.getFullYear() + "-" +
        pad(d.getMonth() + 1) + "-" +
        pad(d.getDate()) + " " +
        pad(d.getHours()) + ":" +
        pad(d.getMinutes()) + ":00"
      );
    }

    // Ajusta para o próximo slot de 15min
    function roundToNext15(d) {
      const ms = d.getTime();
      const step = 15 * 60 * 1000;
      const rounded = Math.ceil(ms / step) * step;
      return new Date(rounded);
    }

    function setDatetimeLocal(el, d) {
      const v =
        d.getFullYear() + "-" +
        pad(d.getMonth() + 1) + "-" +
        pad(d.getDate()) + "T" +
        pad(d.getHours()) + ":" +
        pad(d.getMinutes());
      el.value = v;
    }

    async function criarEventoCalendario(title, fromDt, toDt, desc) {
      if (!currentUserId) throw new Error("Não identifiquei o usuário logado (ownerId).");

      return call("calendar.event.add", {
        type: "user",
        ownerId: String(currentUserId),
        name: title,
        description: desc || "",
        from: fromDt,
        to: toDt
      });
    }

    async function criarTodoNoNegocio(dealId, title, deadlineDt, desc) {
      return call("crm.activity.todo.add", {
        ownerTypeId: 2,
        ownerId: Number(dealId),
        title: title,
        description: desc || "",
        deadline: deadlineDt
      });
    }

    BX24.init(async () => {
      try {
        setStatus("Conectando…");

        const u = await call("user.current", {});
        currentUserId = u && (u.ID || u.Id || u.id);
        if (!currentUserId) throw new Error("user.current não retornou ID.");

        // Sugere horário já redondo
        if (!inicioEl.value) {
          const d = roundToNext15(new Date());
          setDatetimeLocal(inicioEl, d);
        }

        setStatus("Conectado ao Bitrix ✅", "ok");
        btnCriar.disabled = false;
      } catch (e) {
        setStatus("Erro: " + e.message, "err");
      }
    });

    // Se escolher horário quebrado, arredonda
    inicioEl.addEventListener("change", () => {
      if (!inicioEl.value) return;
      const d = new Date(inicioEl.value);
      const r = roundToNext15(d);
      setDatetimeLocal(inicioEl, r);
    });

    btnCriar.addEventListener("click", async () => {
      try {
        setStatus("Criando…");

        const dealLink = dealLinkEl.value.trim();
        const dealId = dealLink ? extractDealIdFromLink(dealLink) : null;

        const tipo = document.getElementById("tipo").value;
        const inicioVal = inicioEl.value;
        const duracao = Number(document.getElementById("duracao").value || 60);
        const obs = document.getElementById("obs").value.trim();

        if (!inicioVal) return setStatus("Preencha a data e hora.", "err");

        const start = roundToNext15(new Date(inicioVal));
        const end = addMinutes(start, duracao);

        const fromDt = toBitrixDateTime(start);
        const toDt = toBitrixDateTime(end);

        const title = tipo + " - Reunião";
        const desc = obs ? ("Obs: " + obs) : "";

        // 1) Calendário
        await criarEventoCalendario(title, fromDt, toDt, desc);

        // 2) To-do no Negócio (se tiver link válido)
        if (dealId) {
          await criarTodoNoNegocio(dealId, title, fromDt, desc);
          setStatus("Criado ✅ (Calendário + To-do no Negócio #" + dealId + ")", "ok");
        } else {
          setStatus("Criado ✅ (Calendário). Link do Negócio inválido/ausente, então não criei To-do no CRM.", "ok");
        }

      } catch (e) {
        setStatus("Erro: " + e.message, "err");
      }
    });
  </script>
</body>
</html>`;

  res.status(200).send(html);
}
