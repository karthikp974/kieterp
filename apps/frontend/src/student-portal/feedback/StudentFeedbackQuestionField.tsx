import type { StudentFeedbackQuestion } from "./student-feedback-types";

type Props = {
  question: StudentFeedbackQuestion;
  value: unknown;
  readOnly: boolean;
  error?: string;
  onChange: (value: unknown) => void;
};

export function StudentFeedbackQuestionField({ question, value, readOnly, error, onChange }: Props) {
  const opts = (question.options ?? {}) as { choices?: string[]; minLabel?: string; maxLabel?: string };

  return (
    <div className={`sp-fb-question${error ? " sp-fb-question--error" : ""}`}>
      <p className="sp-fb-question-prompt">
        {question.prompt}
        {question.required ? <span className="sp-fb-required"> *</span> : null}
      </p>

      {question.type === "RATING_SCALE" ? (
        <div className="sp-fb-rating">
          <p className="sp-fb-rating-labels">
            <span>{opts.minLabel ?? "Poor"}</span>
            <span>{opts.maxLabel ?? "Excellent"}</span>
          </p>
          <div className="sp-fb-rating-scale" role="group" aria-label={question.prompt}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`sp-fb-rating-btn${Number(value) === n ? " sp-fb-rating-btn--active" : ""}`}
                disabled={readOnly}
                onClick={() => onChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {question.type === "YES_NO" ? (
        <div className="sp-fb-yesno" role="group">
          <label className="sp-fb-yesno-opt">
            <input
              type="radio"
              name={question.id}
              checked={value === true}
              disabled={readOnly}
              onChange={() => onChange(true)}
            />
            Yes
          </label>
          <label className="sp-fb-yesno-opt">
            <input
              type="radio"
              name={question.id}
              checked={value === false}
              disabled={readOnly}
              onChange={() => onChange(false)}
            />
            No
          </label>
        </div>
      ) : null}

      {question.type === "MULTIPLE_CHOICE" && opts.choices?.length ? (
        <div className="sp-fb-choices">
          {opts.choices.map((c) => (
            <label key={c} className="sp-fb-choice">
              <input
                type="radio"
                name={question.id}
                checked={value === c}
                disabled={readOnly}
                onChange={() => onChange(c)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      ) : null}

      {question.type === "PARAGRAPH" ? (
        <textarea
          className="sp-fb-textarea"
          value={String(value ?? "")}
          readOnly={readOnly}
          disabled={readOnly}
          rows={4}
          placeholder="Your answer"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}

      {error ? <p className="sp-fb-field-error">{error}</p> : null}
    </div>
  );
}
