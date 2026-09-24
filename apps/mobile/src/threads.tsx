import {
  Archive,
  CalendarDays,
  FileText,
  MessageCircle,
  Monitor,
  Plus,
  RefreshCw,
  Settings2,
} from "lucide-react-native";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { ChatApi, type ChatThread } from "./api";
import { Text, useLanguage } from "./i18n";
import { Button, colors, ErrorNotice, Field, LinkRow, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

export type Selection = { id: string; existing: boolean };
const ThreadContext = createContext<{
  enabled: boolean;
  selection: Selection;
  visited: Selection[];
  mainId: string;
  loading: boolean;
  error: string;
  retry: () => void;
  select: (selection: Selection) => void;
  start: () => void;
  claimPrompt: (id: number) => boolean;
  threads: ChatThread[];
  threadsError: string;
  refreshThreads: () => Promise<void>;
  renameThread: (id: string, name: string) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  isMutating: boolean;
} | null>(null);
export function ThreadsProvider({ children }: { children: ReactNode }) {
  const { navigate, api } = useWorkspace();
  const chatApi = useMemo(() => new ChatApi(api.token), [api.token]);
  const handledPrompt = useRef(0);
  const enabled = true;
  const [selection, setSelection] = useState<Selection>({ id: "main", existing: true });
  const [visited, setVisited] = useState<Selection[]>([{ id: "main", existing: true }]);
  const mainId = "main";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [threadsError, setThreadsError] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [isMutating, setIsMutating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refreshThreads = useCallback(async () => {
    try {
      const result = await chatApi.request<{ threads: ChatThread[] }>("/threads");
      setThreads(result.threads);
      setThreadsError("");
      setError("");
      setLoading(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setThreadsError(message);
      setError(message);
      setLoading(false);
      throw cause;
    }
  }, [chatApi]);
  useEffect(() => {
    setLoading(true);
    setError("");
    void refreshThreads().catch(() => {});
  }, [refreshThreads, attempt]);
  function select(next: Selection) {
    setSelection(next);
    setVisited((items) => (items.some((item) => item.id === next.id) ? items : [...items, next]));
    navigate("chat");
  }
  async function patchThread(id: string, body: { name?: string; archived?: boolean }) {
    setIsMutating(true);
    try {
      await chatApi.request(`/threads/${id}`, body, "PATCH");
      await refreshThreads();
    } finally {
      setIsMutating(false);
    }
  }
  return (
    <ThreadContext.Provider
      value={{
        claimPrompt: (id) => {
          if (handledPrompt.current === id) return false;
          handledPrompt.current = id;
          return true;
        },
        enabled,
        mainId,
        visited,
        loading,
        error,
        retry: () => setAttempt((n) => n + 1),
        selection,
        select,
        start: () => {
          void chatApi
            .request<ChatThread>("/threads", {})
            .then(async (thread) => {
              await refreshThreads();
              select({ id: thread.id, existing: true });
            })
            .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
        },
        threads,
        threadsError,
        refreshThreads,
        renameThread: (id, name) => patchThread(id, { name }),
        setArchived: (id, archived) => patchThread(id, { archived }),
        isMutating,
      }}
    >
      {children}
    </ThreadContext.Provider>
  );
}
export function useMuseThread() {
  const context = useContext(ThreadContext);
  if (!context) throw new Error("Threads provider is unavailable");
  return context;
}
export function ThreadsSheet({ onClose }: { onClose: () => void }) {
  const { language, setLanguage } = useLanguage();
  const {
    enabled,
    selection,
    visited,
    mainId,
    loading,
    error: mainError,
    retry,
    select,
    start,
    threads: savedThreads,
    threadsError,
    refreshThreads,
    renameThread,
    setArchived: updateArchive,
    isMutating,
  } = useMuseThread();
  const { workspace, open, navigate, refresh } = useWorkspace();
  const threads = {
    threads: savedThreads,
    isLoading: loading,
    error: threadsError ? new Error(threadsError) : undefined,
    refetchThreads: () => void refreshThreads().catch(() => {}),
    isMutating,
    renameThread,
    archiveThread: (id: string) => updateArchive(id, true),
    unarchiveThread: (id: string) => updateArchive(id, false),
    fetchMoreError: undefined as Error | undefined,
    hasMoreThreads: false,
    isFetchingMoreThreads: false,
    fetchMoreThreads: () => {},
  };
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);
  async function mutate(action: () => Promise<void>) {
    setError("");
    try {
      await action();
      setEditing(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function go(section: "calendar" | "files" | "apps") {
    onClose();
    navigate(section);
  }
  return (
    <Sheet
      title="OpenMuse"
      subtitle={workspace.mode === "sample" ? "Your workspace" : workspace.profile.name}
      onClose={onClose}
    >
      <View style={{ gap: 14 }}>
        {enabled && loading ? (
          <>
            <ErrorNotice error={mainError} />
            {mainError ? (
              <Button onPress={retry}>Retry main chat</Button>
            ) : (
              <ActivityIndicator color={colors.blueDark} />
            )}
          </>
        ) : enabled ? (
          <>
            <LinkRow
              icon={MessageCircle}
              title="Main chat"
              detail="Your ongoing conversation"
              onPress={() => {
                select({ id: mainId, existing: true });
                onClose();
              }}
            />
            <Button
              primary
              icon={Plus}
              onPress={() => {
                start();
                onClose();
              }}
            >
              New side chat
            </Button>
            <View style={[s.between, { marginTop: 12 }]}>
              <Text style={s.heading}>Side chats</Text>
              <Button small onPress={() => setArchived(!archived)}>
                {archived ? "Show active" : "Archived"}
              </Button>
            </View>
            {threads.isLoading && <ActivityIndicator color={colors.blueDark} />}
            <ErrorNotice error={error || threads.error?.message} />
            {threads.error && (
              <Button small onPress={threads.refetchThreads}>
                Retry conversations
              </Button>
            )}
            {!archived &&
              visited
                .filter(
                  (item) =>
                    item.id !== mainId && !threads.threads.some((saved) => saved.id === item.id),
                )
                .map((item, index) => (
                  <LinkRow
                    key={item.id}
                    icon={MessageCircle}
                    title={`Side chat ${index + 1}`}
                    detail="Open in this app"
                    onPress={() => {
                      select(item);
                      onClose();
                    }}
                  />
                ))}
            {threads.threads
              .filter((thread) => thread.id !== mainId && thread.archived === archived)
              .map((thread) => (
                <View
                  key={thread.id}
                  style={{
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                    gap: 10,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open conversation: ${thread.name || "Untitled conversation"}`}
                    accessibilityState={{ selected: selection.id === thread.id }}
                    onPress={() => {
                      select({ id: thread.id, existing: true });
                      onClose();
                    }}
                    style={[s.row, { gap: 10 }]}
                  >
                    <MessageCircle size={19} color={colors.text} />
                    <Text style={[s.text, { flex: 1 }]}>
                      {thread.name || "Untitled conversation"}
                    </Text>
                  </Pressable>
                  {editing === thread.id && (
                    <Field label="Conversation name" value={name} onChangeText={setName} />
                  )}
                  <View style={[s.row, { gap: 8 }]}>
                    <Button
                      small
                      disabled={threads.isMutating || (editing === thread.id && !name.trim())}
                      onPress={() => {
                        if (editing === thread.id)
                          void mutate(() => threads.renameThread(thread.id, name.trim()));
                        else {
                          setEditing(thread.id);
                          setName(thread.name || "");
                        }
                      }}
                    >
                      {editing === thread.id ? "Save name" : "Rename"}
                    </Button>
                    <Button
                      small
                      icon={Archive}
                      disabled={threads.isMutating}
                      onPress={() =>
                        void mutate(() =>
                          thread.archived
                            ? threads.unarchiveThread(thread.id)
                            : threads.archiveThread(thread.id),
                        )
                      }
                    >
                      {thread.archived ? "Restore" : "Archive"}
                    </Button>
                  </View>
                </View>
              ))}
            {!threads.isLoading &&
              !threads.error &&
              !threads.threads.some(
                (thread) => thread.id !== mainId && thread.archived === archived,
              ) && (
                <Text style={s.muted}>
                  {archived
                    ? "No archived conversations."
                    : "Keep a separate topic here. Your main chat is always available."}
                </Text>
              )}
            <ErrorNotice error={threads.fetchMoreError?.message} />
            {threads.hasMoreThreads && (
              <Button small busy={threads.isFetchingMoreThreads} onPress={threads.fetchMoreThreads}>
                Load more conversations
              </Button>
            )}
            <Text style={s.small}>
              Side chats keep their own conversation context. Your agent’s saved memory is shared.
            </Text>
          </>
        ) : (
          <>
            <LinkRow
              icon={MessageCircle}
              title="Main chat"
              detail="Saved in this workspace"
              onPress={() => {
                navigate("chat");
                onClose();
              }}
            />
            <Text style={s.muted}>
              Your conversation is saved in this workspace. You can manage connections in Apps.
            </Text>
          </>
        )}
        <View style={s.divider} />
        <LinkRow
          icon={Plus}
          title="Delegate task"
          detail="A plan, document, or spending summary"
          onPress={() => {
            onClose();
            open({ type: "delegate" });
          }}
        />
        <LinkRow
          icon={Monitor}
          title="Agent computer"
          detail="Browser, sessions and documents"
          onPress={() => {
            onClose();
            open({ type: "computer" });
          }}
        />
        <LinkRow icon={CalendarDays} title="Calendar" onPress={() => go("calendar")} />
        <LinkRow icon={FileText} title="Files" onPress={() => go("files")} />
        <LinkRow icon={Settings2} title="Apps & settings" onPress={() => go("apps")} />
        <View style={[s.between, { paddingVertical: 8 }]}>
          <Text style={s.text}>{language === "zh" ? "语言" : "Language"}</Text>
          <View style={[s.row, { gap: 8 }]}>
            <Button small primary={language === "zh"} onPress={() => setLanguage("zh")}>
              中文
            </Button>
            <Button small primary={language === "en"} onPress={() => setLanguage("en")}>
              English
            </Button>
          </View>
        </View>
        <Button small icon={RefreshCw} onPress={() => void mutate(refresh)}>
          Refresh workspace
        </Button>
      </View>
    </Sheet>
  );
}
