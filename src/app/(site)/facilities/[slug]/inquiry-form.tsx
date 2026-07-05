"use client";

import { useState } from "react";

const TIMEFRAMES = ["As soon as possible", "Within 1 month", "1–3 months", "3+ months", "Just researching"];

export function InquiryForm({ facilityId, facilityName }: { facilityId: string; facilityName: string }) {
  const [mode, setMode] = useState<"tour" | "question">("tour");
  const [form, setForm] = useState({
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    move_in_timeframe: "",
    tour_date: "",
    tour_time_window: "",
    tour_type: "in_person",
    message: "",
    website: "", // honeypot
  });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const message =
      form.message.trim() ||
      (mode === "tour" ? `Hi, I'd like to schedule a tour of ${facilityName}.` : "");
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facility_id: facilityId,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        move_in_timeframe: form.move_in_timeframe,
        message,
        ...(mode === "tour"
          ? {
              tour_date: form.tour_date,
              tour_time_window: form.tour_time_window,
              tour_type: form.tour_type,
            }
          : {}),
        website: form.website,
      }),
    }).catch(() => null);
    setState(res?.ok ? "sent" : "error");
  }

  if (state === "sent") {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
        <p className="font-medium">Request sent</p>
        <p className="mt-1">
          {facilityName} will get back to you at the contact details you provided.
        </p>
      </section>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/30">
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-800" role="tablist">
        {(
          [
            ["tour", "Schedule a tour"],
            ["question", "Ask a question"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors ${
              mode === m
                ? "bg-white shadow-sm dark:bg-zinc-700"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 space-y-2.5">
        <input
          required
          placeholder="Your name"
          value={form.contact_name}
          onChange={set("contact_name")}
          className={inputCls}
          aria-label="Your name"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={form.contact_email}
          onChange={set("contact_email")}
          className={inputCls}
          aria-label="Email"
        />
        <input
          type="tel"
          placeholder="Phone (optional)"
          value={form.contact_phone}
          onChange={set("contact_phone")}
          className={inputCls}
          aria-label="Phone"
        />
        <select
          value={form.move_in_timeframe}
          onChange={set("move_in_timeframe")}
          className={inputCls}
          aria-label="Move-in timeframe"
        >
          <option value="">Move-in timeframe…</option>
          {TIMEFRAMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {mode === "tour" && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              min={today}
              value={form.tour_date}
              onChange={set("tour_date")}
              className={inputCls}
              aria-label="Preferred tour date"
            />
            <select
              value={form.tour_time_window}
              onChange={set("tour_time_window")}
              className={inputCls}
              aria-label="Time of day"
            >
              <option value="">Any time</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
            <select
              value={form.tour_type}
              onChange={set("tour_type")}
              className={`${inputCls} col-span-2`}
              aria-label="Tour type"
            >
              <option value="in_person">In-person tour</option>
              <option value="video">Video tour</option>
            </select>
          </div>
        )}

        <textarea
          rows={3}
          placeholder={mode === "tour" ? "Anything they should know? (optional)" : "Your question…"}
          required={mode === "question"}
          value={form.message}
          onChange={set("message")}
          className={inputCls}
          aria-label="Message"
        />
        {/* honeypot — hidden from humans */}
        <input
          type="text"
          value={form.website}
          onChange={set("website")}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        {state === "error" && (
          <p className="text-sm text-red-600">Something went wrong — please try again.</p>
        )}
        <button
          type="submit"
          disabled={state === "sending"}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : mode === "tour" ? "Request tour" : "Send question"}
        </button>
        <p className="text-[11px] leading-snug text-zinc-400">
          Sent directly to the facility. No cost, no obligation — we never sell your
          information.
        </p>
      </form>
    </section>
  );
}
