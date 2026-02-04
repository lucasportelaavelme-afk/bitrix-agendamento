export default function handler(req, res) {
  // Aceita GET/POST e devolve HTML sempre (Bitrix testa "servidor" assim)
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Agendar</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    .box { border: 1px solid #ddd; border-radius: 10px; padding: 14px; max-width: 720px; }
    .ok { color: #0a7; }
    .err { color: #b00; }
    label { display:block; margin-top: 10px; font-weight: 600; }
    input, select, button, textarea { width: 100%; padding: 10px; margin-top: 6px; }
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
    <div class="hint">Se não quiser colar link, pode preencher o ID abaixo.</div>

    <label>ID do Negócio (opcional)</label>
    <input id="dealId" type="number" placeholder="1234" />

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

    <label>Data e hora (início)</label>
    <input id="inicio" type="datetime-local" />

    <div class="row">
      <div>
        <label>Email do cliente</label>
        <input id="email" type="email" placeholder="cliente@exemplo.com" />
      </div>
      <div>
        <label>Link do Google Meet</label>
        <input id="meet" type="url" placeholder="https://meet.google.com/..." />
      </div>
    </div>

    <label>Observações (opcional)</label>
    <textarea id="obs" rows="3" placeholder="Ex: pauta, contexto, etc."></textarea>

    <button id="criar" disabled>Criar (Calendário + Atividade no Negócio)</button>
    <div class="hint">Cria evento no calendário do Bitrix e uma atividade no Negócio (se informar ID/Link).</div>
  </div>

  <script src="https://api.bitrix24.com/api/v1/"></script>
  <script>
    const statusEl = document.getElementById("status");
    const btnCriar = document.getElementById("criar");

    let currentUserId = null;

    function setStatus(msg, cls) {
      statusEl.className = cls || "";
      statusEl.textContent = msg;
    }

    function addMinutes(date, mins) {
      return new Date(date.getTime() + mins * 60000);
    }

    function call(method, params) {
      return new Promise((resolve, reject) => {
        BX24.callMethod(method, params, (res) => {
          if (res.error()) reject(new Error(res.error()));
          else resolve(res.data());
        });
      });
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

    // Bitrix aceita bem: YYYY-MM-DD HH:MM:SS (hora local)
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

    async function criarAtividadeNoNegocio(dealId, subject, fromDt, toDt, desc) {
      return call("crm.activity.add", {
        fields: {
          OWNER_TYPE_ID: 2,          // Deal
          OWNER_ID: Number(dealId),
          TYPE_ID: 2,                // meeting
          SUBJECT: subject,
          START_TIME: fromDt,
          END_TIME: toDt,
          COMPLETED: "N",
          DESCRIPTION: desc || ""
        }
      });
    }

    async function criarEventoCalendario(subject, fromDt, toDt, desc) {
      if (!currentUserId) throw new Error("Não consegui identificar o usuário logado (ownerId).");

      // IMPORTANTE: neste método, os campos são top-level: from/to/name/type/ownerId
      return call("calendar.event.add", {
        type: "user",
        ownerId: String(currentUserId),
        name: subject,
        description: desc || "",
        from: fromDt,
        to: toDt
      });
    }

    BX24.init(async () => {
      try {
        setStatus("Conectando…");

        const u = await call("user.current", {});
        currentUserId = u && (u.ID || u.Id || u.id);

        if (!currentUserId) throw new Error("user.current não retornou ID.");

        setStatus("Conectado ao Bitrix ✅", "ok");
        btnCriar.disabled = false;
      } catch (e) {
        setStatus("Erro: " + e.message, "err");
      }
    });

    btnCriar.addEventListener("click", async () => {
      try {
        setStatus("Criando…");

        const dealLink = document.getElementById("dealLink").value.trim();
        const dealIdInput = document.getElementById("dealId").value.trim();
        const tipo = document.getElementById("tipo").value;
        const inicioVal = document.getElementById("inicio").value;
        const duracao = Number(document.getElementById("duracao").value || 60);
        const email = document.getElementById("email").value.trim();
        const meet = document.getElementById("meet").value.trim();
        const obs = document.getElementById("obs").value.trim();

        if (!inicioVal) return setStatus("Preencha a data e hora.", "err");

        const dealId =
          (dealIdInput ? Number(dealIdInput) : null) ||
          (dealLink ? extractDealIdFromLink(dealLink) : null);

        const start = new Date(inicioVal);
        const end = addMinutes(start, duracao);

        const fromDt = toBitrixDateTime(start);
        const toDt = toBitrixDateTime(end);

        const subject = tipo + " - Reunião";
        const descParts = [];
        if (meet) descParts.push("Meet: " + meet);
        if (email) descParts.push("Cliente: " + email);
        if (obs) descParts.push("Obs: " + obs);
        const desc = descParts.join("\\n");

        // 1) Calendário
        await criarEventoCalendario(subject, fromDt, toDt, desc);

        // 2) Atividade no Negócio (se tiver)
        if (dealId) {
          await criarAtividadeNoNegocio(dealId, subject, fromDt, toDt, desc);
          setStatus("Criado ✅ (Calendário + Atividade no Negócio #" + dealId + ")", "ok");
        } else {
          setStatus("Criado ✅ (Calendário). Sem Negócio informado, não registrei atividade no CRM.", "ok");
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
