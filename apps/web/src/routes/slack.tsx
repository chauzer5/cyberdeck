import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useCallback, useEffect, useRef } from "react";
import { MessageSquare, Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Shield, Pencil, Check, Loader2, ExternalLink, User } from "lucide-react";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { cn } from "@/lib/utils";


function SlackPage() {
  const navigate = useNavigate();
  const search = slackRoute.useSearch();
  const selectedChannelId = search.channel ?? null;

  const [showAddForm, setShowAddForm] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [focus, setFocus] = useState("");
  const [ignore, setIgnore] = useState("");
  const [context, setContext] = useState("");
  const [todosEnabled, setTodosEnabled] = useState(false);
  const [todoFocus, setTodoFocus] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [editingFocus, setEditingFocus] = useState(false);
  const [editFocusValue, setEditFocusValue] = useState("");
  const [editingIgnore, setEditingIgnore] = useState(false);
  const [editIgnoreValue, setEditIgnoreValue] = useState("");
  const [editingContext, setEditingContext] = useState(false);
  const [editContextValue, setEditContextValue] = useState("");
  const [editingTodoFocus, setEditingTodoFocus] = useState(false);
  const [editTodoFocusValue, setEditTodoFocusValue] = useState("");
  const contextTextareaRef = useRef<HTMLTextAreaElement>(null);
  const focusInputRef = useRef<HTMLInputElement>(null);
  const ignoreInputRef = useRef<HTMLInputElement>(null);
  const todoFocusInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Refresh on WS events
  const onWsEvent = useCallback(
    (event: { type: string }) => {
      if (event.type === "slack:summary") {
        utils.slack.conversations.byDay.invalidate();
        utils.slack.conversations.latest.invalidate();
        utils.slack.channels.list.invalidate();
      }
      if (event.type === "slack:unread") {
        utils.slack.unreadDmDetails.invalidate();
      }
    },
    [utils]
  );
  useWebSocket(onWsEvent);

  const authStatus = trpc.slack.auth.status.useQuery();
  const refreshAuth = trpc.slack.auth.refresh.useMutation({
    onSuccess: () => utils.slack.auth.status.invalidate(),
  });

  const channels = trpc.slack.channels.list.useQuery();
  const unreadDms = trpc.slack.unreadDmDetails.useQuery(undefined, { refetchInterval: 30_000 });
  const conversationsByDay = trpc.slack.conversations.byDay.useQuery(
    { channelId: selectedChannelId! },
    { enabled: !!selectedChannelId }
  );

  const addChannel = trpc.slack.channels.add.useMutation({
    onMutate: async (input) => {
      await utils.slack.channels.list.cancel();
      const previous = utils.slack.channels.list.getData();
      utils.slack.channels.list.setData(undefined, (old) => [
        ...(old ?? []),
        {
          id: `temp-${Date.now()}`,
          slackChannelId: "",
          name: input.name.startsWith("#") ? input.name : `#${input.name}`,
          focus: input.focus,
          ignore: input.ignore ?? null,
          enabled: true,
          todosEnabled: true,
          todoFocus: null,
          context: input.context ?? null,
          lastPolledAt: null,
          teamId: input.teamId ?? null,
          sortOrder: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setChannelName("");
      setFocus("");
      setIgnore("");
      setContext("");
      setTodosEnabled(true);
      setTodoFocus("");
      setShowAddForm(false);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) utils.slack.channels.list.setData(undefined, context.previous);
    },
    onSettled: (_data, _error) => {
      utils.slack.channels.list.invalidate();
      if (_data?.id) pollChannel.mutate({ channelId: _data.id });
    },
  });

  const removeChannel = trpc.slack.channels.remove.useMutation({
    onSuccess: () => {
      utils.slack.channels.list.invalidate();
      if (selectedChannelId) {
        navigate({ to: "/slack", search: {} });
      }
    },
  });

  const updateChannel = trpc.slack.channels.update.useMutation({
    onSuccess: () => utils.slack.channels.list.invalidate(),
  });

  const pollNow = trpc.slack.pollNow.useMutation({
    onSuccess: () => {
      utils.slack.conversations.byDay.invalidate();
      utils.slack.conversations.latest.invalidate();
      utils.slack.channels.list.invalidate();
    },
  });

  const pollChannel = trpc.slack.pollChannel.useMutation({
    onSuccess: () => {
      utils.slack.conversations.byDay.invalidate();
      utils.slack.conversations.latest.invalidate();
      utils.slack.channels.list.invalidate();
    },
  });



  const selectedChannel = channels.data?.find((c) => c.id === selectedChannelId);

  // Auto-select first channel if none selected
  useEffect(() => {
    if (!selectedChannelId && channels.data && channels.data.length > 0) {
      navigate({ to: "/slack", search: { channel: channels.data[0].id }, replace: true });
    }
  }, [selectedChannelId, channels.data, navigate]);

  // Reset edit state when switching channels
  useEffect(() => {
    setEditingContext(false);
    setEditingFocus(false);
    setEditingIgnore(false);
    setEditingTodoFocus(false);
  }, [selectedChannelId]);

  const workspaces = authStatus.data?.workspaces ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">Slack</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Channel subscriptions and conversation history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshAuth.mutate()}
            disabled={refreshAuth.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)] disabled:opacity-50"
            title="Refresh Slack credentials"
          >
            <Shield className={cn("h-3.5 w-3.5", refreshAuth.isPending && "animate-spin")} />
            Refresh Auth
          </button>
          <button
            onClick={() => pollNow.mutate()}
            disabled={pollNow.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3.5 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", pollNow.isPending && "animate-spin")} />
            Sync
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — DMs + channel list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          {/* Unread DMs section */}
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Direct Messages
              </div>
              {(unreadDms.data?.length ?? 0) > 0 && (
                <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
                  {unreadDms.data!.length}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-0.5 border-b border-border p-2">
            {(unreadDms.data?.length ?? 0) === 0 && (
              <p className="px-3 py-2 text-[11px] text-text-muted">No unread messages</p>
            )}
            {unreadDms.data?.map((dm) => {
              const deepLink = dm.teamId
                ? `slack://user?team=${dm.teamId}&id=${dm.userId}`
                : `slack://user?id=${dm.userId}`;
              return (
                <a
                  key={dm.channelId}
                  href={deepLink}
                  className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-all hover:bg-[rgba(255,45,123,0.04)]"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-cyan/20 to-neon-pink/20 mt-0.5">
                    <User className="h-3 w-3 text-neon-cyan" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-cream truncate">{dm.userName}</span>
                      <span className="shrink-0 rounded-full bg-[rgba(0,240,255,0.12)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-cyan">
                        {dm.unreadCount}
                      </span>
                    </div>
                    {dm.latestText && (
                      <p className="mt-0.5 truncate text-[11px] text-text-muted">
                        {dm.latestText}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              );
            })}
          </div>

          {/* Channels section */}
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Channels
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {channels.data?.map((channel, i) => {
              const isTemp = channel.id.startsWith("temp-");
              return (
              <div
                key={channel.id}
                onClick={() => {
                  if (!isTemp) navigate({ to: "/slack", search: { channel: channel.id } });
                }}
                className={cn(
                  "animate-glass-in group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-all",
                  `stagger-${Math.min(i + 1, 5)}`,
                  (isTemp || !channel.enabled) && "opacity-40",
                  selectedChannelId === channel.id
                    ? "bg-sidebar-accent text-cream shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]"
                    : "text-text-secondary hover:bg-[rgba(255,45,123,0.04)]"
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {isTemp ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neon-pink opacity-60" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-neon-pink opacity-60" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{channel.name}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {channel.focus}
                    </div>
                  </div>
                </div>
                {!isTemp && (
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateChannel.mutate({
                        id: channel.id,
                        enabled: !channel.enabled,
                      });
                    }}
                    className="rounded p-1 text-text-muted hover:text-cream"
                    title={channel.enabled ? "Disable" : "Enable"}
                  >
                    {channel.enabled ? (
                      <ToggleRight className="h-3.5 w-3.5 text-neon-pink" />
                    ) : (
                      <ToggleLeft className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeChannel.mutate({ id: channel.id });
                    }}
                    className="rounded p-1 text-text-muted hover:text-red-400"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                )}
              </div>
              );
            })}

            {channels.data?.length === 0 && (
              <p className="px-3 py-4 text-xs text-text-muted">
                No channels. Add one below.
              </p>
            )}
          </div>

          {/* Add channel */}
          <div className="border-t border-border p-3">
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(255,45,123,0.15)] bg-[rgba(255,45,123,0.06)] px-3 py-2 text-xs font-medium text-neon-pink transition-all hover:bg-[rgba(255,45,123,0.1)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Channel
              </button>
            ) : (
              <div className="space-y-2">
                {workspaces.length > 1 && (
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream focus:border-neon-pink/30 focus:outline-none"
                  >
                    <option value="">All workspaces</option>
                    {workspaces.map((ws) => (
                      <option key={ws.teamId} value={ws.teamId}>
                        {ws.teamName}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="#channel-name"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Focus (e.g. bugs, deploys)"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Ignore (optional, e.g. standups, bots)"
                  value={ignore}
                  onChange={(e) => setIgnore(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
                />
                <textarea
                  placeholder="Context (optional, e.g. team purpose, acronyms)"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none resize-y"
                />
                {/* Todos toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5">
                  <span className="text-xs text-text-secondary">Todos</span>
                  <button
                    type="button"
                    onClick={() => setTodosEnabled((v) => !v)}
                    className="flex items-center gap-1 text-xs"
                  >
                    {todosEnabled ? (
                      <ToggleRight className="h-4 w-4 text-neon-pink" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-text-muted" />
                    )}
                  </button>
                </div>
                {todosEnabled && (
                  <input
                    type="text"
                    placeholder="Todo focus (optional, e.g. bugs assigned to me)"
                    value={todoFocus}
                    onChange={(e) => setTodoFocus(e.target.value)}
                    className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
                  />
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() =>
                      addChannel.mutate({
                        name: channelName,
                        focus,
                        ignore: ignore || undefined,
                        context: context || undefined,
                        teamId: selectedTeamId || undefined,
                        todosEnabled,
                        todoFocus: todoFocus || undefined,
                      })
                    }
                    disabled={!channelName.trim() || addChannel.isPending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setChannelName("");
                      setFocus("");
                      setIgnore("");
                      setContext("");
                      setTodosEnabled(true);
                      setTodoFocus("");
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
                {addChannel.error && (
                  <p className="text-xs text-red-400">{addChannel.error.message}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main area — day-grouped conversations */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedChannel ? (
            <>
              <div className="border-b border-border px-4 py-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-neon-pink" />
                  <span className="text-sm font-semibold text-cream">
                    {selectedChannel.name}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      selectedChannel.enabled
                        ? "bg-[rgba(255,45,123,0.12)] text-neon-pink"
                        : "bg-[rgba(107,114,128,0.12)] text-text-muted"
                    )}
                  >
                    {selectedChannel.enabled ? "active" : "paused"}
                  </span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-text-muted mt-0.5">Context:</span>
                  {editingContext ? (
                    <form
                      className="flex flex-1 items-start gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        updateChannel.mutate({ id: selectedChannel.id, context: editContextValue.trim() });
                        setEditingContext(false);
                      }}
                    >
                      <textarea
                        ref={contextTextareaRef}
                        value={editContextValue}
                        onChange={(e) => setEditContextValue(e.target.value)}
                        onBlur={() => {
                          updateChannel.mutate({ id: selectedChannel.id, context: editContextValue.trim() });
                          setEditingContext(false);
                        }}
                        rows={3}
                        className="flex-1 rounded border border-neon-pink/30 bg-[rgba(0,0,0,0.2)] px-2 py-0.5 text-xs text-cream focus:outline-none resize-y"
                        placeholder="e.g. Infra team incident channel. Acronyms: SLO, PD = PagerDuty"
                      />
                      <button type="submit" className="rounded p-0.5 text-neon-pink hover:text-neon-pink-bright mt-0.5">
                        <Check className="h-3 w-3" />
                      </button>
                    </form>
                  ) : (
                    <button
                      className="group flex items-start gap-1 text-xs text-text-secondary hover:text-cream text-left"
                      onClick={() => {
                        setEditContextValue(selectedChannel.context ?? "");
                        setEditingContext(true);
                        setTimeout(() => contextTextareaRef.current?.focus(), 0);
                      }}
                    >
                      <span className={selectedChannel.context ? "whitespace-pre-wrap" : "text-text-muted italic"}>{selectedChannel.context || "none"}</span>
                      <Pencil className="h-2.5 w-2.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 mt-0.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-text-muted">Focus:</span>
                  {editingFocus ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editFocusValue.trim() && editFocusValue !== selectedChannel.focus) {
                          updateChannel.mutate({ id: selectedChannel.id, focus: editFocusValue.trim() });
                        }
                        setEditingFocus(false);
                      }}
                    >
                      <input
                        ref={focusInputRef}
                        type="text"
                        value={editFocusValue}
                        onChange={(e) => setEditFocusValue(e.target.value)}
                        onBlur={() => {
                          if (editFocusValue.trim() && editFocusValue !== selectedChannel.focus) {
                            updateChannel.mutate({ id: selectedChannel.id, focus: editFocusValue.trim() });
                          }
                          setEditingFocus(false);
                        }}
                        className="flex-1 rounded border border-neon-pink/30 bg-[rgba(0,0,0,0.2)] px-2 py-0.5 text-xs text-cream focus:outline-none"
                        placeholder="e.g. outages, deploys, bugs assigned to me"
                      />
                      <button type="submit" className="rounded p-0.5 text-neon-pink hover:text-neon-pink-bright">
                        <Check className="h-3 w-3" />
                      </button>
                    </form>
                  ) : (
                    <button
                      className="group flex items-center gap-1 text-xs text-text-secondary hover:text-cream"
                      onClick={() => {
                        setEditFocusValue(selectedChannel.focus);
                        setEditingFocus(true);
                        setTimeout(() => focusInputRef.current?.focus(), 0);
                      }}
                    >
                      <span className={selectedChannel.focus ? "" : "text-text-muted italic"}>{selectedChannel.focus || "none"}</span>
                      <Pencil className="h-2.5 w-2.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-text-muted">Ignore:</span>
                  {editingIgnore ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        updateChannel.mutate({ id: selectedChannel.id, ignore: editIgnoreValue.trim() });
                        setEditingIgnore(false);
                      }}
                    >
                      <input
                        ref={ignoreInputRef}
                        type="text"
                        value={editIgnoreValue}
                        onChange={(e) => setEditIgnoreValue(e.target.value)}
                        onBlur={() => {
                          updateChannel.mutate({ id: selectedChannel.id, ignore: editIgnoreValue.trim() });
                          setEditingIgnore(false);
                        }}
                        className="flex-1 rounded border border-neon-pink/30 bg-[rgba(0,0,0,0.2)] px-2 py-0.5 text-xs text-cream focus:outline-none"
                        placeholder="e.g. standups, bot messages, daily reports"
                      />
                      <button type="submit" className="rounded p-0.5 text-neon-pink hover:text-neon-pink-bright">
                        <Check className="h-3 w-3" />
                      </button>
                    </form>
                  ) : (
                    <button
                      className="group flex items-center gap-1 text-xs text-text-secondary hover:text-cream"
                      onClick={() => {
                        setEditIgnoreValue(selectedChannel.ignore ?? "");
                        setEditingIgnore(true);
                        setTimeout(() => ignoreInputRef.current?.focus(), 0);
                      }}
                    >
                      <span className={selectedChannel.ignore ? "" : "text-text-muted italic"}>{selectedChannel.ignore || "none"}</span>
                      <Pencil className="h-2.5 w-2.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-text-muted">Todos:</span>
                  <button
                    onClick={() =>
                      updateChannel.mutate({
                        id: selectedChannel.id,
                        todosEnabled: !selectedChannel.todosEnabled,
                      })
                    }
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-cream"
                  >
                    {selectedChannel.todosEnabled !== false ? (
                      <>
                        <ToggleRight className="h-3.5 w-3.5 text-neon-pink" />
                        <span>on</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="h-3.5 w-3.5" />
                        <span className="text-text-muted">off</span>
                      </>
                    )}
                  </button>
                </div>
                {selectedChannel.todosEnabled !== false && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted">Todo focus:</span>
                    {editingTodoFocus ? (
                      <form
                        className="flex flex-1 items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          updateChannel.mutate({ id: selectedChannel.id, todoFocus: editTodoFocusValue.trim() });
                          setEditingTodoFocus(false);
                        }}
                      >
                        <input
                          ref={todoFocusInputRef}
                          type="text"
                          value={editTodoFocusValue}
                          onChange={(e) => setEditTodoFocusValue(e.target.value)}
                          onBlur={() => {
                            updateChannel.mutate({ id: selectedChannel.id, todoFocus: editTodoFocusValue.trim() });
                            setEditingTodoFocus(false);
                          }}
                          className="flex-1 rounded border border-neon-pink/30 bg-[rgba(0,0,0,0.2)] px-2 py-0.5 text-xs text-cream focus:outline-none"
                          placeholder="e.g. bugs assigned to me, action items, deployment tasks"
                        />
                        <button type="submit" className="rounded p-0.5 text-neon-pink hover:text-neon-pink-bright">
                          <Check className="h-3 w-3" />
                        </button>
                      </form>
                    ) : (
                      <button
                        className="group flex items-center gap-1 text-xs text-text-secondary hover:text-cream"
                        onClick={() => {
                          setEditTodoFocusValue(selectedChannel.todoFocus ?? "");
                          setEditingTodoFocus(true);
                          setTimeout(() => todoFocusInputRef.current?.focus(), 0);
                        }}
                      >
                        <span className={selectedChannel.todoFocus ? "" : "text-text-muted italic"}>
                          {selectedChannel.todoFocus || "all (bugs, tasks, decisions, requests)"}
                        </span>
                        <Pencil className="h-2.5 w-2.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {conversationsByDay.data?.days.map((dayGroup) => (
                  <DaySection
                    key={dayGroup.day}
                    day={dayGroup.day}
                    headline={dayGroup.headline}
                    conversationCount={dayGroup.conversationCount}
                    conversations={dayGroup.conversations}
                    slackChannelId={selectedChannel.slackChannelId}
                    teamId={selectedChannel.teamId}
                  />
                ))}

                {conversationsByDay.data?.days.length === 0 && (
                  <div className="flex flex-1 items-center justify-center pt-16">
                    <div className="text-center">
                      <MessageSquare className="mx-auto h-10 w-10 text-text-muted opacity-30" />
                      <p className="mt-3 text-sm text-text-muted">
                        No conversations yet for this channel
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Click "Sync" to fetch the latest activity
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-text-muted opacity-40" />
                <p className="mt-3 text-sm text-text-muted">
                  Select a channel to view its conversation history
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDay(dayStr: string) {
  const date = new Date(dayStr + "T00:00:00Z");
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (dayStr === todayStr) return "Today";
  if (dayStr === yesterdayStr) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function DaySection({
  day,
  headline,
  conversationCount,
  conversations,
  slackChannelId,
  teamId,
}: {
  day: string;
  headline: string;
  conversationCount: number;
  conversations: {
    id: string;
    conversationTs: string;
    summary: string;
    messageCount: number;
    lastMessageAt: string;
  }[];
  slackChannelId: string;
  teamId: string | null;
}) {
  return (
    <div>
      {/* Day header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-cream">{formatDay(day)}</span>
          <span className="text-[10px] text-text-muted">
            {conversationCount} {conversationCount === 1 ? "conversation" : "conversations"}
          </span>
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
      {/* Day headline */}
      <p className="mb-3 text-xs leading-relaxed text-text-secondary">{headline}</p>

      {/* Conversation list */}
      <div className="space-y-2">
        {conversations.map((conv, i) => {
          const messageTs = conv.conversationTs;
          const deepLink = teamId
            ? `slack://channel?team=${teamId}&id=${slackChannelId}${messageTs ? `&message=${messageTs}` : ""}`
            : `slack://channel?id=${slackChannelId}${messageTs ? `&message=${messageTs}` : ""}`;

          return (
            <div
              key={conv.id}
              className={cn(
                "animate-glass-in group flex items-start gap-2.5 rounded-lg border border-[rgba(255,45,123,0.06)] bg-[rgba(255,45,123,0.02)] px-3 py-2.5 transition-all hover:border-[rgba(255,45,123,0.12)]",
                `stagger-${Math.min(i + 1, 5)}`
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-text-secondary">{conv.summary}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                  <span>{conv.messageCount} {conv.messageCount === 1 ? "msg" : "msgs"}</span>
                </div>
              </div>
              <a
                href={deepLink}
                className="mt-0.5 shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:text-neon-pink group-hover:opacity-100"
                title="View in Slack"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const slackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slack",
  component: SlackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    channel: (search.channel as string) ?? undefined,
  }),
});
