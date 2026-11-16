import { useEffect, useMemo, useState } from "react";
import {
  MdPerson,
  MdVolumeUp,
  MdHandshake,
  MdCheck,
  MdDelete,
  MdMic,
  MdSms,
} from "react-icons/md";
import AccessShell from "./AccessShell";
import FormEngine from "./engine/FormEngine";
import PartnerRegister from "./PartnerRegister";
import { useAccess } from "./context";
import { pick } from "./translation helper";
import { buildSignupSchema, DEFAULT_PARTNERS } from "./schemas";
import {
  tokenFromUrl,
  loadClaim,
  dropClaim,
  saveProfile,
  saveSupport,
  getRegistrationDraftToken,
  saveRegistrationDraft,
  refreshRegistrationDraftActivity,
  sendRegistrationResumeLink,
  loadRegistrationDraft,
  deleteRegistrationDraft,
  clearRegistrationDraftToken,
} from "./store";

const T = {
  chooseTitle: { en: "How would you like to do this?" },
  standard: { en: "Standard: read and type" },
  simple: { en: "Simple words, pictures and sound" },
  partner: { en: "A partner is helping me register" },
  keep: { en: "Yes, keep my profile" },
  del: { en: "No, delete it" },
  claimTitle: { en: "A partner made a profile for you" },
  claimMissing: {
    en: "We could not find this link on this device. Please ask your partner to send it again, or start a new sign-up.",
  },
  claimKept: {
    en: "Your profile is yours now. You can change or delete it any time.",
  },
  claimDeleted: { en: "The profile was deleted." },
  newSignup: { en: "Start a new sign-up" },
  saved: {
    en: "Your profile is saved. Open this page again at any time to see or change it. Your support choices stay private on this device.",
  },
  registrationComplete: {
    en: "The entered name and phone matched the document text. Your completed details will be returned to the host application; this service does not store them.",
  },
  registrationCompleteNoHandler: {
    en: "The entered name and phone matched the document text, but no host completion handler is configured. Your details were not saved.",
  },
  reviewRequired: {
    en: "We could not match both the name and phone number, or they were not readable. Registration is not approved. Please show your original document to a staff member for human review.",
  },
  resumeMissing: {
    en: "This resume link is no longer available. Start a new registration or ask a staff member for help.",
  },
  resumeNew: { en: "Start a new registration" },
  receivedRefugee: {
    en: "You are registered with your refugee ID. A staff member will check the number when you first visit. You can start learning now.",
    simple: "You are signed up. Bring your refugee ID when you visit. You can start now.",
  },
  receivedOther: {
    en: "You are registered. Please bring your document when you first visit, and a staff member will look at it. You can start learning now.",
    simple: "You are signed up. Bring your paper when you visit. You can start now.",
  },
  referred: {
    en: "You are registered. {partner} will contact you to help with documents. You do not need any proof to start learning.",
    simple: "You are signed up. {partner} will call or text you. You can start now.",
  },
  referralCode: { en: "Your reference code. Keep it to show the partner:", simple: "Your code. Show it to the group:" },
  supportKept: {
    en: "Your support choices are saved on this device only. They were not sent with your profile.",
    simple: "Your support choices stay on this phone.",
  },
  next: { en: "Go to jobs" },
  textLink: { en: "Text me a link to continue later", simple: "Text me a link" },
  textLinkSent: {
    en: "We texted a link to your phone. Open it on any phone to carry on. No time limit.",
    simple: "We sent a link to your phone.",
  },
  textLinkFailed: {
    en: "We could not send the link. Your answers are still saved. You can try again.",
    simple: "Could not send. Your answers are still saved.",
  },
};

function TextResumeLink({ answers, resumeToken }) {
  const { lang, simple } = useAccess();
  const t = (k) => pick(T[k], lang, simple);
  const [state, setState] = useState("idle");
  const canText =
    resumeToken && answers.phone && answers.contactMethods?.includes("sms");
  if (!canText) return null;
  return (
    <>
      <button
        type="button"
        className="ax-btn ax-btn-ghost"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          try {
            await sendRegistrationResumeLink(resumeToken);
            setState("sent");
          } catch {
            setState("failed");
          }
        }}
      >
        <MdSms aria-hidden="true" /> {t("textLink")}
      </button>
      <p className="ax-hint" role="status">
        {state === "sent" ? t("textLinkSent") : state === "failed" ? t("textLinkFailed") : ""}
      </p>
    </>
  );
}

const LOCAL_ONLY_ANSWERS = new Set(["identityDocument", "support"]);

function serverAnswers(answers, schema) {
  const hidden = new Set(
    schema.steps.filter((s) => s.showIf && !s.showIf(answers)).map((s) => s.id),
  );
  return Object.fromEntries(
    Object.entries(answers).filter(
      ([key, value]) =>
        !LOCAL_ONLY_ANSWERS.has(key) &&
        !hidden.has(key) &&
        value !== undefined &&
        value !== null &&
        !(typeof value === "string" && !value.trim()),
    ),
  );
}

function Choose({ onPick, onVoicePick, hasDraft }) {
  const { lang, simple, tr, setPrefs } = useAccess();
  const t = (k) => pick(T[k], lang, simple);
  return (
    <section className="ax-engine">
      <h2 className="ax-title" tabIndex={-1}>
        {t("chooseTitle")}
      </h2>
      <p className="ax-hint">{tr("noTimer")}</p>
      <button
        type="button"
        className="ax-btn ax-btn-primary"
        onClick={onVoicePick}
        disabled={typeof window === "undefined" || !window.SpeechRecognition && !window.webkitSpeechRecognition}
      >
        <MdMic aria-hidden="true" /> {tr("startVoiceRegistration")}
      </button>
      {typeof window !== "undefined" && !window.SpeechRecognition && !window.webkitSpeechRecognition && (
        <p className="ax-hint" role="status">{tr("voiceControlUnsupported")}</p>
      )}
      <p className="ax-hint">{tr("voicePrivacy")}</p>
      {hasDraft && (
        <p className="ax-hint" role="status">
          {tr("resumeFound")}
        </p>
      )}
      <div className="ax-cards">
        <button
          type="button"
          className="ax-card ax-cardbtn"
          onClick={() => {
            setPrefs({ simple: false });
            onPick("form");
          }}
        >
          <MdPerson className="ax-cardicon" aria-hidden="true" />
          <span>{t("standard")}</span>
        </button>
        <button
          type="button"
          className="ax-card ax-cardbtn"
          onClick={() => {
            setPrefs({ simple: true });
            onPick("form");
          }}
        >
          <MdVolumeUp className="ax-cardicon" aria-hidden="true" />
          <span>{t("simple")}</span>
        </button>
        <button
          type="button"
          className="ax-card ax-cardbtn"
          onClick={() => onPick("partner")}
        >
          <MdHandshake className="ax-cardicon" aria-hidden="true" />
          <span>{t("partner")}</span>
        </button>
      </div>
    </section>
  );
}

function Claim({ token, onDone }) {
  const { lang, simple } = useAccess();
  const t = (k) => pick(T[k], lang, simple);
  const [claim, setClaim] = useState(undefined);
  const [outcome, setOutcome] = useState("");

  useEffect(() => {
    let live = true;
    loadClaim(token).then((c) => live && setClaim(c ?? null));
    return () => {
      live = false;
    };
  }, [token]);

  if (claim === undefined) return null;
  if (outcome) {
    return (
      <section className="ax-engine">
        <p role="status">
          {outcome === "kept" ? t("claimKept") : t("claimDeleted")}
        </p>
        <button type="button" className="ax-btn" onClick={onDone}>
          {t("newSignup")}
        </button>
      </section>
    );
  }
  if (!claim) {
    return (
      <section className="ax-engine">
        <p role="alert">{t("claimMissing")}</p>
        <button type="button" className="ax-btn" onClick={onDone}>
          {t("newSignup")}
        </button>
      </section>
    );
  }
  return (
    <section className="ax-engine">
      <h2 className="ax-title" tabIndex={-1}>
        {t("claimTitle")}
      </h2>
      <p>
        <strong>{claim.partnerName}</strong>
      </p>
      <p>{claim.profile.name}</p>
      <div className="ax-row">
        <button
          type="button"
          className="ax-btn ax-btn-primary"
          onClick={() => {
            saveProfile({ answers: claim.profile });
            if (claim.support?.length) saveSupport({ needs: claim.support });
            dropClaim(token);
            setOutcome("kept");
          }}
        >
          <MdCheck aria-hidden="true" /> {t("keep")}
        </button>
        <button
          type="button"
          className="ax-btn"
          onClick={() => {
            dropClaim(token);
            setOutcome("deleted");
          }}
        >
          <MdDelete aria-hidden="true" /> {t("del")}
        </button>
      </div>
    </section>
  );
}

function Inner({ partners, onComplete, onReviewRequired }) {
  const { lang, simple, tr, setPrefs } = useAccess();
  const t = (k) => pick(T[k], lang, simple);
  const schema = useMemo(() => buildSignupSchema(), []);
  const claimToken = tokenFromUrl("claim");
  const resumeToken = tokenFromUrl("resume") || getRegistrationDraftToken();

  const [stage, setStage] = useState(
    claimToken
      ? "claim"
      : resumeToken
        ? "resume"
        : "choose",
  );
  const [resume, setResume] = useState(null);
  const [draftToken, setDraftToken] = useState(resumeToken);
  const [startVoiceOnly, setStartVoiceOnly] = useState(false);

  const clearResumeUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("resume");
    window.history.replaceState(null, "", url.toString());
  };

  useEffect(() => {
    if (stage !== "resume") return;
    let live = true;
    loadRegistrationDraft(resumeToken)
      .then((draft) => {
        if (!live) return;
        setResume({ ...draft, formId: "signup", resumeToken });
        setDraftToken(resumeToken);
        setStage("form");
      })
      .catch(() => {
        if (!live) return;
        setStage("resume-error");
      });
    return () => {
      live = false;
    };
  }, [stage, resumeToken]);

  const saveProgress = async ({ answers, stepId, resumeToken: currentToken }) => {
    const safeAnswers = serverAnswers(answers, schema);
    const token = await saveRegistrationDraft({
      token: currentToken || draftToken,
      answers: safeAnswers,
      stepId,
    });
    setDraftToken(token);
    return { resumeToken: token };
  };
  const save = async (answers) => {
    const document = answers.identityDocument || {};
    const registration = serverAnswers(answers, schema);
    const isKebele = !registration.idRoute || registration.idRoute === "kebele";
    if (Array.isArray(answers.support) && answers.support.length) {
      saveSupport({ needs: answers.support });
    }
    const response = await fetch("/api/v1/registration/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: draftToken,
        registration,
        ...(isKebele
          ? {
              document: { name: document.documentName, phone: document.documentPhone },
              consent: document.consent === true,
            }
          : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error?.message || tr("sendFailed"));
    }
    const finished = result.status !== "review_required";
    if (finished) {
      clearRegistrationDraftToken();
      clearResumeUrl();
    }
    return {
      ...result,
      supportSaved: Array.isArray(answers.support) && answers.support.length > 0,
      preserveDraft: !finished,
    };
  };
  const discardDraft = async (token) => {
    await deleteRegistrationDraft(token);
    clearResumeUrl();
  };
  const done = ({ result, answers, reset }) => {
    if (result?.status === "review_required") {
      const reviewData = Object.fromEntries(
        Object.entries(answers).filter(([key]) => key !== "identityDocument"),
      );
      return (
        <>
          <p role="alert">{t("reviewRequired")}</p>
          {onReviewRequired && (
            <button type="button" className="ax-btn ax-btn-primary" onClick={() => onReviewRequired(reviewData, result)}>
              {tr("requestHumanReview")}
            </button>
          )}
          <button type="button" className="ax-btn" onClick={reset}>{t("resumeNew")}</button>
        </>
      );
    }

    const partnerLabel =
      DEFAULT_PARTNERS.find((p) => p.value === result?.registration?.partner)?.label ||
      "A partner organisation";
    const message =
      result?.status === "referred"
        ? t("referred").replace("{partner}", partnerLabel)
        : result?.status === "received"
          ? t(result.idRoute === "refugee" ? "receivedRefugee" : "receivedOther")
          : onComplete
            ? t("registrationComplete")
            : t("registrationCompleteNoHandler");
    return (
      <>
        <p role="status">{message}</p>
        {result?.referralCode && (
          <p>
            {t("referralCode")} <strong>{result.referralCode}</strong>
          </p>
        )}
        {result?.supportSaved && <p className="ax-hint">{t("supportKept")}</p>}
        {onComplete && (
          <button
            type="button"
            className="ax-btn ax-btn-primary"
            onClick={() => onComplete({
              ...result.registration,
              ...(result.referralCode ? { referralCode: result.referralCode } : {}),
              verification: {
                status: result.status,
                matches: result.matches,
                authenticityVerified: result.authenticityVerified,
              },
            })}
          >
            {t("next")}
          </button>
        )}
      </>
    );
  };

  if (stage === "resume") return <p role="status">{tr("loading")}</p>;
  if (stage === "resume-error")
    return (
      <section className="ax-engine">
        <p role="alert">{t("resumeMissing")}</p>
        <button
          type="button"
          className="ax-btn ax-btn-primary"
          onClick={() => {
            clearRegistrationDraftToken();
            clearResumeUrl();
            setResume(null);
            setDraftToken(null);
            setStage("choose");
          }}
        >
          {t("resumeNew")}
        </button>
      </section>
    );
  if (stage === "claim")
    return (
      <Claim
        token={claimToken}
        onDone={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setStage("choose");
        }}
      />
    );
  if (stage === "partner") return <PartnerRegister partners={partners} />;
  if (stage === "choose")
    return (
      <Choose
        onPick={(nextStage) => {
          setStartVoiceOnly(false);
          setStage(nextStage);
        }}
        onVoicePick={() => {
          setStartVoiceOnly(true);
          setPrefs?.({ voiceGuidance: true });
          setStage("form");
        }}
        hasDraft={Boolean(resumeToken)}
      />
    );
  return (
    <FormEngine
      key="signup"
      schema={schema}
      resume={resume ?? undefined}
      persistLocally={false}
      showSaveLaterButton={false}
      onProgress={saveProgress}
      onActivity={refreshRegistrationDraftActivity}
      onDiscardDraft={discardDraft}
      onSubmit={save}
      autoStartVoiceControl={startVoiceOnly}
      footerExtra={(props) => <TextResumeLink {...props} />}
      doneContent={done}
    />
  );
}

/**
 * Drop-in sign-up and profile. <AccessibleOnboarding partners={[...]} onComplete={(profile) => ...} />
 * Support needs are saved privately and are never part of the profile passed to onComplete.
 */
export default function AccessibleOnboarding({ partners, onComplete, onReviewRequired }) {
  return (
    <AccessShell>
      <Inner partners={partners} onComplete={onComplete} onReviewRequired={onReviewRequired} />
    </AccessShell>
  );
}
