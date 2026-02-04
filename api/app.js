export default function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Agendador v4</title>
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
    .version { font-size: 12px; color: #777; margin-top: -8px; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Agendador</h2>
    <div class="version">v4</div>
    <div id="status"></div>

    <label>Link do Negócio</label>
    <input id="dealLink" type="url" placeholder="https://b24-.../crm/deal/details/1234/" />

    <div class="row">
      <div>
        <label>Tipo</label>
        <select id="tipo">
          <option value="R1">R1</option>
          <option value="R2">R2</option>
          <option value="RA">RA</option>
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
        <label>Hora</label>
        <select id="hora"></select>
      </div>
    </div>

    <label>Observações (opcional)</label>
    <textarea id="obs" rows="3" placeholder="Ex: pauta, contexto, etc."></textarea>

    <button id="criar" disabled>Criar reunião</button>

    <div class="hint">Cria evento no calendário do Bitrix e registra To-do no Negócio (se o link estiver válido).</div>
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
      statusEl.textContent = msg || "";
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
      const step = 15 * 60 * 1000;
      const rounded = new Date(Math.ceil(now.getTime() / step) * step);

      dataEl.value =
        rounded.getFullYear() + "-" + pad(rounded.getMonth() + 1) + "-" + pad(rounded.getDate());

      const time = pad(rounded.getHours()) + ":" + pad(rounded.getMinutes());
      horaEl.value = Array.from(horaEl.options).some(o => o.value === time) ? time : "09:00";
    }

    function buildStartDate() {
      const dateVal = dataEl.value;
      const timeVal = horaEl.value;
      if (!dateVal || !timeVal) return null;

      const [Y, M, D] = dateVal.split("-").map(Number);
      const [h, m] = timeVal.split(":").map(Number);
      return new Date(Y, M - 1, D, h, m, 0);
    }

    async function criarEventoCalendario(title, fromDt, toDt, desc) {
      if (!currentUserId) throw new Error("Usuário não identificado.");

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
        // não mostramos status de "conectado"
        setStatus("");

        const u = await call("user.current", {});
        currentUserId = u && (u.ID || u.Id || u.id);
        if (!currentUserId) throw new Error("user.current não retornou ID.");

        buildTimeOptions();
        setDefaultDateTime();

        btnCriar.disabled = false;
      } catch (e) {
        setStatus("Erro: " + e.message, "err");
      }
    });

    btnCriar.addEventListener("click", async () => {
      try {
        setStatus("");

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
        }

        setStatus("Reunião criada ✅", "ok");
      } catch (e) {
        setStatus("Erro: " + e.message, "err");
      }
    });
  </script>
</body>
</html>`;

  res.status(200).send(html);
}
