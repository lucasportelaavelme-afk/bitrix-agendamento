const statusEl = document.getElementById("status");
const btnCriar = document.getElementById("criar");

function setStatus(msg, cls) {
  if (!statusEl) return;
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

function getDealId() {
  // Só funciona se o app estiver aberto dentro do card do Negócio (aba Agendar)
  try {
    const info = BX24.placement.info();
    const opt = (info && info.options) ? info.options : {};
    return opt.ENTITY_ID || opt.entityId || opt.ID || opt.id || null;
  } catch (e) {
    return null;
  }
}

async function criarAtividadeNoNegocio(dealId, subject, startIso, endIso, meetLink) {
  return call("crm.activity.add", {
    fields: {
      OWNER_TYPE_ID: 2,          // 2 = Deal (Negócio)
      OWNER_ID: Number(dealId),
      TYPE_ID: 2,                // meeting
      SUBJECT: subject,
      START_TIME: startIso,
      END_TIME: endIso,
      COMPLETED: "N",
      DESCRIPTION: meetLink ? `Meet: ${meetLink}` : ""
    }
  });
}

async function criarEventoCalendario(subject, startIso, endIso, meetLink) {
  return call("calendar.event.add", {
    type: "user",
    fields: {
      NAME: subject,
      DATE_FROM: startIso,
      DATE_TO: endIso,
      DESCRIPTION: meetLink ? `Meet: ${meetLink}` : "",
      SKIP_TIME: "N"
    }
  });
}

function init() {
  if (!window.BX24) {
    setStatus("BX24 não carregou. Abra este app dentro do Bitrix.", "err");
    return;
  }

  BX24.init(() => {
    setStatus("Conectado ao Bitrix ✅", "ok");
    if (btnCriar) btnCriar.disabled = false;
  });
}

async function onCriar() {
  try {
    setStatus("Criando…", "");

    const tipo = document.getElementById("tipo").value;
    const inicioVal = document.getElementById("inicio").value;
    const duracao = Number(document.getElementById("duracao").value || 60);
    const email = (document.getElementById("email").value || "").trim();
    const meet = (document.getElementById("meet").value || "").trim();

    if (!inicioVal) {
      setStatus("Preencha a data e hora.", "err");
      return;
    }

    const dealId = getDealId();
    if (!dealId) {
      setStatus("Não identifiquei o ID do Negócio. Abra este app dentro do card do Negócio (aba Agendar).", "err");
      return;
    }

    const start = new Date(inicioVal);
    const end = addMinutes(start, duracao);

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const subject = `${tipo} - Reunião`;

    // 1) aparece no Negócio
    await criarAtividadeNoNegocio(dealId, subject, startIso, endIso, meet);

    // 2) cai no calendário do assessor
    await criarEventoCalendario(subject, startIso, endIso, meet);

    // Observação: convite por e-mail pro cliente depende de mail/calendar do portal.
    // Por enquanto salvamos o email no texto da atividade (pra não perder).
    if (email) {
      await call("crm.activity.add", {
        fields: {
          OWNER_TYPE_ID: 2,
          OWNER_ID: Number(dealId),
          TYPE_ID: 4, // email
          SUBJECT: `Cliente convidado: ${email}`,
          DESCRIPTION: `Convite a enviar para: ${email}\nMeet: ${meet || "(sem link)"}`
        }
      });
    }

    setStatus("Agendamento criado ✅ (Atividade + Calendário)", "ok");
  } catch (e) {
    setStatus(`Erro: ${e.message}`, "err");
  }
}

init();
if (btnCriar) btnCriar.addEventListener("click", onCriar);
