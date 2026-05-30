import { useState } from 'react';

const EMPTY = {
  shipName: '',
  flag: '',
  imoNumber: '',
  vesselType: '',
  numSeafarers: '',
  nationalities: '',
  portOfAbandonment: '',
  abandonmentDate: '',
  notificationDate: '',
  circumstances: '',
  actionsTaken: '',
  repatriationStatus: '',
  remunerationStatus: '',
  reportingOrg: '',
  comments: '',
  isFollowUp: '',
  isCommentSubmission: '',
};

function Field({ label, hint, children, required }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  );
}

const inputClass = 'w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const textareaClass = `${inputClass} resize-y min-h-[80px]`;

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pb-1 border-b border-gray-200">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

function RadioGroup({ name, value, onChange }) {
  return (
    <div className="flex gap-4 mt-1">
      {['Yes', 'No'].map(opt => (
        <label key={opt} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
          <input
            type="radio"
            name={name}
            value={opt}
            checked={value === opt}
            onChange={e => onChange(e.target.value)}
            className="accent-blue-600"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

function buildMailtoBody(f) {
  const line = (label, val) => val ? `${label}: ${val}\n` : '';
  const yn = v => v || '—';

  return [
    'REPORT OF ABANDONMENT\n',
    '--- VESSEL ---',
    line('Name of ship',       f.shipName),
    line('Flag',               f.flag),
    line('IMO No.',            f.imoNumber),
    line('Type of vessel',     f.vesselType),
    '',
    '--- CREW ---',
    line('No. of seafarers',   f.numSeafarers),
    line('Nationalities',      f.nationalities),
    '',
    '--- ABANDONMENT ---',
    line('Port of abandonment',       f.portOfAbandonment),
    line('Date of abandonment',       f.abandonmentDate),
    line('Date of notification',      f.notificationDate),
    line('Circumstances',             f.circumstances),
    '',
    '--- RESOLUTION STATUS ---',
    line('Actions taken',             f.actionsTaken),
    line('Repatriation status',       f.repatriationStatus),
    line('Outstanding remuneration',  f.remunerationStatus),
    '',
    '--- REPORTING ---',
    line('Reporting Member / Org.',   f.reportingOrg),
    line('Comments',                  f.comments),
    '',
    '--- SUBMISSION TYPE ---',
    `Follow-up submission: ${yn(f.isFollowUp)}`,
    `Comments/observations only: ${yn(f.isCommentSubmission)}`,
  ].join('\n');
}

export default function ReportForm() {
  const [form, setForm] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const subject = [
      'Report of Abandonment',
      form.shipName,
      form.imoNumber,
    ].filter(Boolean).join(' — ');

    const body = buildMailtoBody(form);
    const mailto = `mailto:sector@ilo.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSubmitted(true);
  }

  function handleReset() {
    setForm(EMPTY);
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">✉️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Email client opened</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your email client should have opened with the report pre-filled.
            Review the details and send when ready.
          </p>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Submit another report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-gray-900">Report of Abandonment</h1>
          <p className="text-sm text-gray-500 mt-1">
            ILO form for reporting cases of abandoned seafarers. Submitting will open your email
            client with this report pre-filled, addressed to{' '}
            <span className="font-medium text-gray-700">sector@ilo.org</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">

          <Section title="Vessel">
            <Field label="Name of ship" required>
              <input className={inputClass} value={form.shipName} onChange={set('shipName')} required />
            </Field>
            <Field label="Flag" required>
              <input className={inputClass} value={form.flag} onChange={set('flag')} required />
            </Field>
            <Field label="IMO Number" hint="7-digit number" required>
              <input className={inputClass} value={form.imoNumber} onChange={set('imoNumber')}
                pattern="\d{7}" maxLength={7} required />
            </Field>
            <Field label="Type of vessel">
              <input className={inputClass} value={form.vesselType} onChange={set('vesselType')} />
            </Field>
          </Section>

          <Section title="Crew">
            <Field label="No. of seafarers">
              <input className={inputClass} type="number" min={1} value={form.numSeafarers} onChange={set('numSeafarers')} />
            </Field>
            <Field label="Nationalities">
              <input className={inputClass} value={form.nationalities} onChange={set('nationalities')} />
            </Field>
          </Section>

          <Section title="Abandonment">
            <Field label="Port of abandonment">
              <input className={inputClass} value={form.portOfAbandonment} onChange={set('portOfAbandonment')} />
            </Field>
            <Field label="Abandonment date">
              <input className={inputClass} type="date" value={form.abandonmentDate} onChange={set('abandonmentDate')} />
            </Field>
            <Field label="Date of notification to the flag State">
              <input className={inputClass} type="date" value={form.notificationDate} onChange={set('notificationDate')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Circumstances">
                <textarea className={textareaClass} value={form.circumstances} onChange={set('circumstances')} />
              </Field>
            </div>
          </Section>

          <Section title="Resolution status">
            <div className="sm:col-span-2">
              <Field label="Actions taken to resolve the case">
                <textarea className={textareaClass} value={form.actionsTaken} onChange={set('actionsTaken')} />
              </Field>
            </div>
            <Field label="Repatriation status">
              <textarea className={textareaClass} value={form.repatriationStatus} onChange={set('repatriationStatus')} />
            </Field>
            <Field label="Outstanding remuneration status">
              <textarea className={textareaClass} value={form.remunerationStatus} onChange={set('remunerationStatus')} />
            </Field>
          </Section>

          <Section title="Reporting">
            <Field label="Reporting Member Govt. or Org.">
              <input className={inputClass} value={form.reportingOrg} onChange={set('reportingOrg')} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Comments"
                hint="When submitting comments or observations, complete at minimum: Name of ship, Flag, IMO Number, and Date of abandonment."
              >
                <textarea className={textareaClass} value={form.comments} onChange={set('comments')} />
              </Field>
            </div>
          </Section>

          {/* Submission type */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pb-1 border-b border-gray-200">
              Submission type
            </h2>
            <div className="space-y-4">
              <Field label="Is this a follow-up submission to a previous case of abandonment?">
                <RadioGroup name="followUp" value={form.isFollowUp}
                  onChange={v => setForm(f => ({ ...f, isFollowUp: v }))} />
              </Field>
              <Field label="Is this a submission of comments or observations relating to a reported case of abandonment?">
                <RadioGroup name="commentSubmission" value={form.isCommentSubmission}
                  onChange={v => setForm(f => ({ ...f, isCommentSubmission: v }))} />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={handleReset}
              className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
              Clear
            </button>
            <button type="submit"
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
              Open in email client →
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
