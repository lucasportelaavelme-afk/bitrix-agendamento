const statusEl = document.getElementById("status");
const btnCriar = document.getElementById("criar");

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
    const m = String(url).match(/\/deal\/details\/(\d+)\//i) || String(url).match(/\/deal\/details\/(\d+)/i);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function criarAtividadeNoNegocio(dealId, subject, startIso, endIso, desc) {
  return call("crm.activity.add", {
    fields: {
      OWNER_TYPE_ID: 2,
      OWNER_ID: Number(dealId),
      TYPE_ID: 2,
      SUBJECT: subject,
      START_TIME: startIso,
      END_TIME: endIso,
      COMPLETED: "N",
      DESCRIPTION: desc || ""
    }
  });
}

async function criarEventoCalendario(subject, startIso, endIso, desc) {
  return call("calendar.event.add", {
    type: "user",
    fields: {
      NAME: subject,
      DATE_FROM: startIso,
      DATE_TO: endIso,
      DESCRIPTION: desc || "",
      SKIP_TIME: "N"
    }
  });
}

BX24.init(() => {
  setStatus("Conectado ao Bitrix ✅", "ok");
  btnCriar.disabled = false;
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

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const subject = `${tipo} - Reunião`;
    const descParts = [];
    if (meet) descParts.push(`Meet: ${meet}`);
    if (email) descParts.push(`Cliente: ${email}`);
    if (obs) descParts.push(`Obs: ${obs}`);
    const desc = descParts.join("\n");

    await criarEventoCalendario(subject, startIso, endIso, desc);

    if (dealId) {
      await criarAtividadeNoNegocio(dealId, subject, startIso, endIso, desc);
      setStatus(`Criado ✅ (Calendário + Atividade no Negócio #${dealId})`, "ok");
    } else {
      setStatus("Criado ✅ (Calendário). Sem Negócio informado, então não registrei atividade no CRM.", "ok");
    }
  } catch (e) {
    setStatus("Erro: " + e.message, "err");
  }
});
