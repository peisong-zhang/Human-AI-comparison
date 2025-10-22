import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startSession as apiStartSession } from "../api/client";
import { useSession } from "../context/SessionContext";
import { ModeConfig } from "../types";

interface FormState {
  participant_id: string;
  group_id: string;
  mode_id: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { config, loadingConfig, session, startSession } = useSession();
  const [form, setForm] = useState<FormState>({
    participant_id: "",
    group_id: "",
    mode_id: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      navigate("/task");
    }
  }, [session, navigate]);

  useEffect(() => {
    if (!config) return;
    const defaultGroup = config.groups[0]?.group_id ?? "";
    const defaultMode = config.modes[0]?.mode_id ?? "";
    setForm((prev) => ({
      participant_id: prev.participant_id,
      group_id: prev.group_id || defaultGroup,
      mode_id: prev.mode_id || defaultMode
    }));
  }, [config]);

  const selectedMode: ModeConfig | undefined = useMemo(() => {
    if (!config) return undefined;
    return config.modes.find((mode) => mode.mode_id === form.mode_id);
  }, [config, form.mode_id]);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.participant_id.trim()) {
      setError("Participant ID is required.");
      return;
    }
    setError(null);
    try {
      setLoading(true);
      const sessionData = await apiStartSession({
        participant_id: form.participant_id.trim(),
        group_id: form.group_id,
        mode_id: form.mode_id
      });
      startSession(sessionData);
      navigate("/task");
    } catch (err) {
      console.error(err);
      setError("Failed to start session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <header className="pb-8">
        <h1 className="text-3xl font-semibold text-white">
          Human + AI Comparison Study
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Please log in with your participant ID to begin the evaluation.
        </p>
      </header>
      <main className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl">
        {loadingConfig ? (
          <p className="text-sm text-slate-300">Loading configuration...</p>
        ) : config ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">
                Participant ID
              </label>
              <input
                type="text"
                value={form.participant_id}
                onChange={(event) => handleChange("participant_id", event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none"
                placeholder="e.g. P12345"
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">
                  Participant Group
                </label>
                <select
                  value={form.group_id}
                  onChange={(event) => handleChange("group_id", event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-slate-100 focus:border-primary focus:outline-none"
                >
                  {config.groups.map((group) => (
                    <option key={group.group_id} value={group.group_id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Mode</label>
                <select
                  value={form.mode_id}
                  onChange={(event) => handleChange("mode_id", event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-slate-100 focus:border-primary focus:outline-none"
                >
                  {config.modes.map((mode) => (
                    <option key={mode.mode_id} value={mode.mode_id}>
                      {mode.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {selectedMode && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                <div className="font-semibold text-slate-100">
                  {selectedMode.name}
                </div>
                <p className="mt-1">
                  Images: {selectedMode.images.length} | Randomized:{" "}
                  {selectedMode.randomize ? "Yes" : "No"}
                </p>
              </div>
            )}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {loading ? "Starting..." : "Start Session"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-rose-400">Failed to load configuration.</p>
        )}
      </main>
    </div>
  );
}
