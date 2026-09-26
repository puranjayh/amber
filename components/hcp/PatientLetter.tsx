import type { PatientLetter } from "./letter";

/** A take-home note for the patient. Nothing on this page enrols anyone. */
export function PatientLetter({ letter }: { letter: PatientLetter }) {
  return (
    <article className="letter mx-auto w-full max-w-2xl bg-surface px-4 py-8 text-ink sm:px-10">
      <header className="border-b border-line pb-4">
        <p className="text-[11px] font-medium text-ink-3">Information for you</p>
        <h1 className="mt-2 text-[24px] font-medium leading-snug">{letter.title}</h1>
        <p className="mt-2 text-[13px] text-ink-2">
          {letter.nctId}. {letter.phaseLine}
        </p>
        <p className="mt-3 text-[15px] leading-relaxed">
          Prepared for {letter.patientId} by {letter.physicianName}, {letter.physicianSite}.
          Screened as of {letter.asOf}.
        </p>
        <p className="mt-2 text-[15px] leading-relaxed">
          This is information to take away and think about. It does not sign you up, it does not
          enrol you, and it does not reserve a place.
        </p>
      </header>

      <section className="mt-6">
        <h2 className="text-[18px] font-medium">Why you, specifically</h2>
        <p className="mt-2 text-[15px] leading-relaxed">{letter.scoreLine}</p>
        {letter.reasons.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {letter.reasons.map((reason) => (
              <li key={reason.criterionId} className="text-[15px] leading-relaxed">
                <p>{reason.sentence}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {reason.sourceLabel}
                  {reason.quote
                    ? `: “${reason.quote}”`
                    : ". The exact sentence was not stored with this check."}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[15px] leading-relaxed">
            None of the checks can be confirmed from your record yet.
          </p>
        )}
      </section>

      {letter.blockers.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[18px] font-medium">Why this study does not fit</h2>
          <ul className="mt-3 space-y-3">
            {letter.blockers.map((reason) => (
              <li key={reason.criterionId} className="text-[15px] leading-relaxed">
                <p>{reason.sentence}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {reason.sourceLabel}
                  {reason.quote
                    ? `: “${reason.quote}”`
                    : ". The exact sentence was not stored with this check."}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-[18px] font-medium">What still needs checking</h2>
        {letter.questions.length === 0 ? (
          <p className="mt-2 text-[15px] leading-relaxed">
            Nothing in this check is still unknown.
          </p>
        ) : (
          letter.questions.map((group) => (
            <div key={group.check} className="mt-3">
              <p className="text-[15px] leading-relaxed">{group.check}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
                {group.items.map((item) => (
                  <li key={item.ids.join("-")}>{item.gap}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-[18px] font-medium">What the trial is trying to find out</h2>
        <p className="mt-2 text-[15px] leading-relaxed">{letter.objective}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-[18px] font-medium">What it would involve</h2>
        <dl className="mt-2 space-y-2 text-[15px] leading-relaxed">
          <div>
            <dt className="font-medium">Where</dt>
            <dd>{letter.location}</dd>
          </div>
          <div>
            <dt className="font-medium">Travel</dt>
            <dd>{letter.travel}</dd>
          </div>
          <div>
            <dt className="font-medium">Visits</dt>
            <dd>{letter.visits}</dd>
          </div>
          <div>
            <dt className="font-medium">How long</dt>
            <dd>{letter.duration}</dd>
          </div>
          <div>
            <dt className="font-medium">Costs</dt>
            <dd>{letter.costs}</dd>
          </div>
          <div>
            <dt className="font-medium">Travel costs</dt>
            <dd>{letter.travelCovered}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 border-t border-line pt-4">
        <h2 className="text-[18px] font-medium">What happens next</h2>
        <p className="mt-2 text-[15px] leading-relaxed">
          Nothing happens unless you decide to talk about it with {letter.physicianTalk}. Taking
          this page home does not sign you up and does not enrol you. The choice is yours, discussed
          with your doctor.
        </p>
        <p className="mt-4 text-[13px] text-ink-3">Prepared by {letter.physicianName}.</p>
      </section>
    </article>
  );
}
