import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startSession as apiStartSession } from "../api/client";
import { useSession } from "../context/SessionContext";
import { GroupConfig } from "../types";

interface FormState {
  participant_id: string;
  group_id: string;
  participant_role: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { config, loadingConfig, session, startSession } = useSession();
  const [form, setForm] = useState<FormState>({
    participant_id: "",
    group_id: "",
    participant_role: ""
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
    const defaultRole = config.participant_roles?.[0] ?? "";
    setForm((prev) => ({
      participant_id: prev.participant_id,
      group_id: prev.group_id || defaultGroup,
      participant_role: prev.participant_role || defaultRole
    }));
  }, [config]);

  const selectedGroup: GroupConfig | undefined = useMemo(() => {
    if (!config) return undefined;
    return config.groups.find((group) => group.group_id === form.group_id);
  }, [config, form.group_id]);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.participant_id.trim()) {
      setError("Participant ID is required. / 请填写参与者ID。");
      return;
    }
    setError(null);
    try {
      setLoading(true);
      const sessionData = await apiStartSession({
        participant_id: form.participant_id.trim(),
        group_id: form.group_id,
        participant_role: form.participant_role,
        user_agent: window.navigator.userAgent
      });
      startSession(sessionData);
      navigate("/task");
    } catch (err) {
      console.error(err);
      setError("Failed to start session. Please try again. / 启动会话失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <header className="pb-8">
        <h1 className="text-3xl font-semibold text-white">
          Human + AI Comparison Study / 人机对比实验
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Please log in with your participant ID to begin the evaluation.
          <br />
          请使用参与者ID登录并开始实验。
        </p>
      </header>
      <main className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl">
        {loadingConfig ? (
          <p className="text-sm text-slate-300">Loading configuration... / 正在加载配置...</p>
        ) : config ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">
                Participant ID / 参与者ID
              </label>
              <input
                type="text"
                value={form.participant_id}
                onChange={(event) => handleChange("participant_id", event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none"
                placeholder="e.g. name (名字)"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">
                Participant Group / 分组
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
              <label className="text-sm font-medium text-slate-200">
                Participant Role / 角色
              </label>
              <select
                value={form.participant_role}
                onChange={(event) => handleChange("participant_role", event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-slate-100 focus:border-primary focus:outline-none"
              >
                {config.participant_roles && config.participant_roles.length > 0 ? (
                  config.participant_roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))
                ) : (
                  <option value="">No roles configured / 未配置角色</option>
                )}
              </select>
            </div>
            {selectedGroup && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                <div className="font-semibold text-slate-100">{selectedGroup.name}</div>
                <p className="mt-1 text-xs text-slate-400">
                  Role selected / 已选角色: {form.participant_role || "Not specified / 未指定"}
                </p>
                <ul className="mt-2 space-y-2 text-xs text-slate-400">
                  {selectedGroup.sequence.map((stage, idx) => {
                    const mode = config.modes.find((m) => m.mode_id === stage.mode_id);
                    const subset = config.subsets.find((s) => s.subset_id === stage.subset_id);
                    const label = stage.label ?? `${mode?.name ?? stage.mode_id} · ${subset?.name ?? stage.subset_id}`;
                    return (
                      <li key={`${stage.mode_id}-${stage.subset_id}-${idx}`}>
                        <span className="font-semibold text-slate-100">Stage {idx + 1} / 阶段{idx + 1}:</span>{" "}
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {loading ? "Starting... / 正在开始..." : "Start Session / 开始实验"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-rose-400">Failed to load configuration. / 配置加载失败。</p>
        )}
      </main>
    </div>
  );
}
