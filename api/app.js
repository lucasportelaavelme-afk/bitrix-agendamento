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

    <div class="row">
      <div>
        <label>Data</label>
        <input id="data" type="date" />
      </div>
      <div>
        <label>Hora (15 em 15)</label>
        <select id="hora"></select>
      </div>
    </div>
    <div class="hint">Agora só existe horário 00, 15, 30, 45.</div>

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
    const dataEl = document.getElementById("data");
    const horaEl = document.getElementById("hora");

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

    function buildTimeOptions() {
      // Ajuste aqui se quiser restringir horário comercial.
      // Ex: startHour=9 endHour=19 (inclui 19:45)
      const startHour = 0;
      const endHour = 23;

      horaEl.innerHTML = "";
      for (let h = startHour; h <= endHour; h++) {
        for (const m of [0, 15, 30, 45]) {
          const v = pad(h) + ":" + pad(m);
          const opt = document.createElement("option");
          opt.value = v;
          opt.textContent = v;
          horaEl.appendChild(opt);
        }
      }
    }

    function setDefaultDateTime() {
      const now = new Date();
      // próximo slot de 15 min
      const step = 15 * 60 * 1000;
      const rounded = new Date(Math.ceil(now.getTime() / step) * step);

      const yyyy = rounded.getFullYear();
      const mm = pad(rounded.getMonth() + 1);
      const dd = pad(rounded.getDate());
      dataEl.value = yyyy + "-" + mm + "-" + dd;

      const hh = pad(rounded.getHours());
      const min = pad(rounded.getMinutes());
      const time = hh + ":" + min;

      // garante que existe
      const option = Array.from(horaEl.options).find(o => o.value === time);
      horaEl.value = option ? time : "09:00";
    }

    function buildStartDate() {
      const dateVal = dataEl.value;   // YYYY-MM-DD
      const timeVal = horaEl.value;   // HH:MM
      if (!dateVal || !timeVal) return null;

      const [Y, M, D] = dateVal.split("-").map(Number);
      const [h, m] = timeVal.split(":").map(Number);

      // Data local (sem timezone UTC)
      return new Date(Y, M - 1, D, h, m, 0);
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

        buildTimeOptions();
        setDefaultDateTime();

        setStatus("Conectado ao Bitrix ✅", "ok");
        btnCriar.disabled = false;
      } catch (e) {
        setStatus("Erro: " + e.message, "err");
      }
    });

    btnCriar.addEventListener("click", async () => {
      try {
        setStatus("Criando…");

        const dealLink = dealLinkEl.value.trim();
        const dealId = dealLink ? extractDealIdFromLink(dealLink) : null;

        const tipo = document.getElementById("tipo").value;
        const duracao = Number(document.getElementById("duracao").value || 60);
        const obs = document.getElementById("obs").value.trim();

        const start = buildStartDate();
        if (!start) return setStatus("Selecione data e hora.", "err");

        const end = addMinutes(start, duracao);

        const fromDt = toBitrixDateTime(start);
        const toDt = toBitrixDateTime(end);

        const title = tipo + " - Reunião";
        const desc = obs ? ("Obs: " + obs) : "";

        await criarEventoCalendario(title, fromDt, toDt, desc);

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
