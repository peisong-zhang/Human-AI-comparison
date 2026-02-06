import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchQuotaStatus, startSession as apiStartSession } from "../api/client";
import { useSession } from "../context/SessionContext";
import { GroupConfig, QuotaStatusResponse } from "../types";

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
  const [groupConfirmed, setGroupConfirmed] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatusResponse | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      navigate("/task");
    }
  }, [session, navigate]);

  useEffect(() => {
    setGroupConfirmed(false);
  }, [form.group_id]);

  useEffect(() => {
    let cancelled = false;
    setQuotaLoading(true);
    fetchQuotaStatus()
      .then((data) => {
        if (cancelled) return;
        setQuotaStatus(data);
        setQuotaError(null);
      })
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        setQuotaStatus(null);
        setQuotaError("Failed to load group quota. / 无法加载分组名额。");
      })
      .finally(() => {
        if (!cancelled) setQuotaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const quotaByGroupId = useMemo(() => {
    if (!quotaStatus) return new Map<string, QuotaStatusResponse["groups"][number]>();
    return new Map(quotaStatus.groups.map((group) => [group.group_id, group]));
  }, [quotaStatus]);

  const quotaTotals = useMemo(() => {
    if (!quotaStatus) return null;
    let completedSum = 0;
    let limitSum = 0;
    let hasLimit = false;
    quotaStatus.groups.forEach((group) => {
      completedSum += group.completed ?? 0;
      if (typeof group.limit === "number") {
        limitSum += group.limit;
        hasLimit = true;
      }
    });
    return {
      completed: completedSum,
      limit: hasLimit ? limitSum : null
    };
  }, [quotaStatus]);

  const isSingleGroup = (config?.groups.length ?? 0) === 1;

  const selectedGroup: GroupConfig | undefined = useMemo(() => {
    if (!config) return undefined;
    return config.groups.find((group) => group.group_id === form.group_id);
  }, [config, form.group_id]);

  useEffect(() => {
    if (!config || !isSingleGroup) return;
    const onlyGroup = config.groups[0];
    if (onlyGroup && form.group_id !== onlyGroup.group_id) {
      setForm((prev) => ({ ...prev, group_id: onlyGroup.group_id }));
      setGroupConfirmed(true);
    }
  }, [config, form.group_id, isSingleGroup]);

  const rolesAvailable = (config?.participant_roles?.length ?? 0) > 0;

  const splitBilingualLabel = (value: string, fallback: { en: string; zh: string }) => {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parts = trimmed.split(/\s*\/\s*/);
    if (parts.length < 2) {
      return { en: trimmed, zh: trimmed };
    }
    return { en: parts[0].trim(), zh: parts.slice(1).join(" / ").trim() };
  };

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.participant_id.trim()) {
      setError("Participant name is required. / 请填写参与者姓名。");
      return;
    }
    if (!rolesAvailable) {
      setError("Participant roles are not configured. / 未配置角色，无法继续。");
      return;
    }
    if (!form.participant_role) {
      setError("Participant role is required. / 请先选择角色。");
      return;
    }
    if (!form.group_id) {
      setError("Participant group is required. / 请先选择分组。");
      return;
    }
    const selectedQuota = quotaByGroupId.get(form.group_id);
    if (
      selectedQuota &&
      typeof selectedQuota.remaining === "number" &&
      selectedQuota.remaining <= 0
    ) {
      setError("Selected group is full. Please choose another. / 该组名额已满，请选择其他分组。");
      return;
    }
    if (!isSingleGroup && !groupConfirmed) {
      setError("Please confirm your group before starting. / 请确认你的分组后再开始。");
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
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-12">
      <header className="pb-8">
        <h1 className="text-3xl font-semibold text-white">
          Human + AI Comparison Study / 人机对比实验
        </h1>
        {!loadingConfig && !quotaLoading && (
          <p className="mt-2 text-sm text-slate-300">
            Completed participants / 已完成参与者: {quotaTotals?.completed ?? 0}
            {quotaTotals?.limit !== null && quotaTotals ? ` / ${quotaTotals.limit}` : ""}
          </p>
        )}
        <div className="mt-4 rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Use the same name and role to resume your previous progress.
          <br />
          使用相同姓名与身份可恢复之前的答题进度。
        </div>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <main className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl">
          {loadingConfig ? (
            <p className="text-sm text-slate-300">Loading configuration... / 正在加载配置...</p>
          ) : config ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">
                    Participant Name / 参与者姓名
                  </label>
                  {!form.participant_id.trim() && (
                    <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Required / 必填
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={form.participant_id}
                  onChange={(event) => handleChange("participant_id", event.target.value)}
                  className={`w-full rounded-lg border bg-slate-950 px-4 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none ${
                    form.participant_id.trim()
                      ? "border-slate-700 focus:border-primary"
                      : "border-rose-500/60 ring-1 ring-rose-500/30 focus:border-rose-400"
                  }`}
                  placeholder="请输入姓名 / Please enter your name"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">
                    Participant Role / 角色
                  </label>
                  {!form.participant_role && (
                    <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Required / 必填
                    </span>
                  )}
                </div>
                <select
                  value={form.participant_role}
                  onChange={(event) => handleChange("participant_role", event.target.value)}
                  className={`w-full rounded-lg border bg-slate-950 px-4 py-2 text-base text-slate-100 focus:outline-none ${
                    form.participant_role
                      ? "border-slate-700 focus:border-primary"
                      : "border-rose-500/60 ring-1 ring-rose-500/30 focus:border-rose-400"
                  }`}
                >
                  <option value="" disabled>
                    Select a role / 请选择角色
                  </option>
                  {rolesAvailable ? (
                    config.participant_roles?.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))
                  ) : (
                    <option value="">No roles configured / 未配置角色</option>
                  )}
                </select>
              </div>
              {!isSingleGroup ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-200">
                      Participant Group / 分组
                    </label>
                    {!form.group_id && (
                      <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Required / 必填
                      </span>
                    )}
                  </div>
                  <select
                    value={form.group_id}
                    onChange={(event) => handleChange("group_id", event.target.value)}
                    className={`w-full rounded-lg border bg-slate-950 px-4 py-2 text-base text-slate-100 focus:outline-none ${
                      form.group_id
                        ? "border-slate-700 focus:border-primary"
                        : "border-rose-500/60 ring-1 ring-rose-500/30 focus:border-rose-400"
                    }`}
                  >
                    <option value="" disabled>
                      Select a group / 请选择分组
                    </option>
                    {config.groups.map((group) => (
                      <option key={group.group_id} value={group.group_id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">
                    Participant Group / 分组
                  </label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-100">
                    <span>{selectedGroup?.name ?? "Default / 默认"}</span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-200">
                      Auto assigned / 自动分配
                    </span>
                  </div>
                </div>
              )}
              {false && !isSingleGroup && form.participant_role && (
                <div />
              )}
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
              {selectedGroup && !isSingleGroup && (
                <label
                  className={`relative flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                    groupConfirmed
                      ? "border-slate-800 bg-slate-900/60 text-slate-200"
                      : "border-rose-500/50 bg-rose-500/10 text-rose-100"
                  }`}
                >
                  <span
                    className={`absolute -top-2 right-4 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      groupConfirmed ? "bg-slate-800 text-slate-200" : "bg-rose-500 text-white"
                    }`}
                  >
                    Required / 必选
                  </span>
                  <div className="relative mt-1">
                    <input
                      type="checkbox"
                      checked={groupConfirmed}
                      onChange={(event) => setGroupConfirmed(event.target.checked)}
                      className={`h-4 w-4 rounded border-slate-600 bg-slate-950 text-primary focus:ring-primary ${
                        groupConfirmed ? "" : "ring-2 ring-rose-400/70 ring-offset-2 ring-offset-rose-500/5"
                      }`}
                    />
                    {!groupConfirmed && (
                      <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-rose-300" />
                    )}
                  </div>
                  <span className="space-y-1">
                    {(() => {
                      const groupLabel = splitBilingualLabel(selectedGroup.name, {
                        en: selectedGroup.name,
                        zh: selectedGroup.name
                      });
                      const roleLabel = splitBilingualLabel(form.participant_role || "", {
                        en: "the selected role",
                        zh: "已选角色"
                      });
                      return (
                        <>
                          <div>
                            I confirm that I am assigned to{" "}
                            <span className="font-semibold">{groupLabel.en}</span> as{" "}
                            <span className="font-semibold">{roleLabel.en}</span> and understand I cannot
                            change my assignment after starting.
                          </div>
                          <div className="text-rose-100/90">
                            我确认我属于 <span className="font-semibold">{groupLabel.zh}</span> 的{" "}
                            <span className="font-semibold">{roleLabel.zh}</span>
                            ，并确认身份；开始后无法更改分组。
                          </div>
                        </>
                      );
                    })()}
                  </span>
                </label>
              )}
              {error && <p className="text-sm text-rose-400">{error}</p>}
              <button
                type="submit"
                disabled={
                  loading ||
                  !form.participant_id.trim() ||
                  !form.group_id ||
                  !form.participant_role ||
                  (!isSingleGroup && !groupConfirmed) ||
                  !rolesAvailable
                }
                className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {loading ? "Starting... / 正在开始..." : "Start Session / 开始实验"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-rose-400">Failed to load configuration. / 配置加载失败。</p>
          )}
        </main>
        <aside className="self-start rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-300">
          <div className="text-sm font-semibold text-slate-100">
            Start checklist / 开始流程
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Complete the steps below before clicking start.
            <br />
            请按以下步骤完成后再点击开始实验。
          </p>
          <ol className="mt-4 space-y-3 text-sm text-slate-200">
            <li className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-xs font-semibold text-slate-200">
                  1
                </div>
                <div>
                  <div>Fill in Participant Name</div>
                  <div className="text-xs text-slate-400">填写参与者姓名</div>
                </div>
              </div>
            </li>
            <li className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-xs font-semibold text-slate-200">
                  2
                </div>
                <div>
                  <div>Choose Participant Role</div>
                  <div className="text-xs text-slate-400">选择角色</div>
                </div>
              </div>
            </li>
            {isSingleGroup ? (
              <li className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-xs font-semibold text-slate-200">
                    3
                  </div>
                  <div>
                    <div>Group auto-assigned</div>
                    <div className="text-xs text-slate-400">分组已自动分配</div>
                  </div>
                </div>
              </li>
            ) : (
              <li className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-xs font-semibold text-slate-200">
                    3
                  </div>
                  <div>
                    <div>Choose Participant Group</div>
                    <div className="text-xs text-slate-400">选择分组</div>
                  </div>
                </div>
              </li>
            )}
            <li className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-xs font-semibold text-slate-200">
                  4
                </div>
                <div>
                  <div>Confirm the assignment and click Start Session</div>
                  <div className="text-xs text-slate-400">确认身份后点击开始实验</div>
                </div>
              </div>
            </li>
          </ol>
          <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
            <div className="text-sm font-semibold text-amber-100">
              Before you start / 开始前须知
            </div>
            <ul className="mt-3 space-y-2 text-xs text-amber-200/90">
              <li>
                Please enter your participant name and select your role before starting.
              </li>
              <li>After starting, the assignment cannot be changed.</li>
            </ul>
            <ul className="mt-2 space-y-2 text-xs text-amber-200/90">
              <li>请在开始前填写参与者姓名，并选择你的角色。</li>
              <li>开始后无法更改身份分配。</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
