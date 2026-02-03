function showMsg(text, cls) {
  const el = document.getElementById("msg");
  el.className = cls;
  el.textContent = text;
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

async function call(method, params) {
  return new Promise((resolve, reject) => {
    BX24.callMethod(method, params, (res) => {
      if (res.error()) reject(new Error(res.error()));
      else resolve(res.data());
    });
  });
}

function getDealContext() {
  // Em placements de CRM, o Bitrix passa contexto do item
  // Vamos tentar várias formas sem travar.
  try {
    const info = BX24.placement.info();
    // Em detail-tab, costuma vir ENTITY_ID / entityId
    const options = (info && info.options) ? info.options : {};
    const dealId =
      options.ENTITY_ID ||
      options.entityId ||
      options.ID ||
      options.id ||
      null;
    return { dealId, placementInfo: info };
  } catch (e) {
    return { dealId: null, placementInfo: null };
  }
}

async function createCrmActivity(dealId, subject, startIso, endIso, clientEmail, meetLink) {
  // Cria atividade no timeline do Negócio. :contentReference[oaicite:1]{index=1}
  const fields = {
    OWNER_TYPE_ID: 2,           // 2 = Deal (Negócio)
    OWNER_ID: Number(dealId),
    TYPE_ID: 2,                 // 2 = meeting (geralmente)
    SUBJECT: subject,
    START_TIME: startIso,
    END_TIME: endIso,
    COMPLETED: "N",
    DESCRIPTION: meetLink ? `Link: ${meetLink}` : "",
  };

  if (clientEmail) {
    fields.COMMUNICATIONS = [{
      TYPE: "EMAIL",
      VALUE: clientEmail,
      ENTITY_TYPE_ID: 3, // 3 = Contact (às vezes), pode variar; deixamos mesmo assim
      ENTITY_ID: 0
    }];
  }

  return call("crm.activity.add", { fields });
}

async function createCalendarEvent(subject, startIso, endIso, clientEmail, meetLink) {
  // Cria evento no calendário. :contentReference[oaicite:2]{index=2}
  // Obs: convidados externos por email podem depender das configs de mail/calendar.
  const eventFields = {
    NAME: subject,
    DATE_FROM: startIso,
    DATE_TO: endIso,
    DESCRIPTION: meetLink ? `Meet: ${meetLink}` : "",
    SKIP_TIME: "N",
  };

  // Alguns портais aceitam GUESTS (IDs internos) e ATTENDEES/EMAILS variam.
  // A gente mantém minimalista e garante pelo menos o evento + CRM activity.
  return call("calendar.event.add", { type: "user", ownerId: BX24.getAuth().member_id ? undefined : undefined, fields: eventFields });
}

document.getElementById("criar").addEventListener("click", async () => {
  try {
    showMsg("Criando...", "hint");

    const tipo = document.getElementById("tipo").value;
    const inicioVal = document.getElementById("inicio").value;
    const duracao = Number(document.getElementById("duracao").value || 60);
    const email = document.getElementById("email").value.trim();
    const meet = document.getElementById("meet").value.trim();

    if (!inicioVal) {
      showMsg("Preenche a data/hora de início.", "err");
      return;
    }

    const start = new Date(inicioVal);
    const end = addMinutes(start, duracao);

    // ISO sem segundos já é suficiente na maioria dos casos
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const { dealId } = getDealContext();
    if (!dealId) {
      showMsg("Não consegui identificar o ID do negócio. Abra este app dentro do Negócio (aba/widget).", "err");
      return;
    }

    const subject = `${tipo} - Reunião`;

    // 1) Registra no CRM (para ficar visível no Negócio)
    await createCrmActivity(dealId, subject, startIso, endIso, email, meet);

    // 2) Cria evento no calendário (para agenda/Outlook)
    // (Se teu portal tiver mail/calendar configurado, isso sincroniza bem.)
    await createCalendarEvent(subject, startIso, endIso, email, meet);

    showMsg("Agendamento criado e registrado no negócio.", "ok");
  } catch (e) {
    showMsg(`Erro: ${e.message}`, "err");
  }
});
