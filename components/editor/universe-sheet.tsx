"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  Clock3,
  Compass,
  GitBranch,
  Loader2,
  Network,
  Orbit,
  RefreshCw,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { ClientApiError, requestJson } from "@/lib/client-api";

type UniverseNode = {
  id: string;
  slug: string;
  title: string;
  style: string | null;
  createdAt: string;
  updatedAt: string;
  parentStoryId: string | null;
  depth: number;
  remixCount: number;
  isCurrent: boolean;
  isRoot: boolean;
};

type UniverseGraph = {
  currentStoryId: string;
  rootStoryId: string;
  totalStories: number;
  totalEdges: number;
  maxDepth: number;
  nodes: UniverseNode[];
  edges: Array<{
    sourceStoryId: string;
    remixStoryId: string;
    createdAt: string;
  }>;
};

type UniverseActivityEvent = {
  id: string;
  type: "branch_created" | "story_updated" | "remix_milestone";
  storyId: string;
  storySlug: string;
  storyTitle: string;
  relatedStoryId: string | null;
  relatedStorySlug: string | null;
  relatedStoryTitle: string | null;
  message: string;
  happenedAt: string;
};

type UniverseActivityFeed = {
  generatedAt: string;
  eventCount: number;
  events: UniverseActivityEvent[];
  activeBranches: Array<{
    storyId: string;
    storySlug: string;
    storyTitle: string;
    remixCount: number;
    updatedAt: string;
    isCurrent: boolean;
  }>;
};

type UniverseInteractiveBranch = {
  storyId: string;
  storySlug: string;
  storyTitle: string;
  style: string | null;
  updatedAt: string;
  remixCount: number;
  isCurrent: boolean;
  velocity: "fresh" | "rising" | "steady";
};

type UniverseInteractiveState = {
  generatedAt: string;
  rootStoryId: string;
  currentStoryId: string;
  focusStoryId: string;
  totalStories: number;
  totalBranches: number;
  path: Array<{
    storyId: string;
    storySlug: string;
    storyTitle: string;
    isCurrent: boolean;
    isFocus: boolean;
  }>;
  episode: {
    storyId: string;
    storySlug: string;
    storyTitle: string;
    style: string | null;
    depth: number;
    updatedAt: string;
    isCurrent: boolean;
    isRoot: boolean;
    isLeaf: boolean;
    promptHint: string;
    parent: {
      storyId: string;
      storySlug: string;
      storyTitle: string;
    } | null;
    branches: UniverseInteractiveBranch[];
  };
  recommendation: {
    primaryBranchStoryId: string | null;
    reason: string;
  };
};

interface UniverseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  storySlug: string;
  canManageCollaborators?: boolean;
}

type Collaborator = {
  id: string;
  storyId: string;
  userId: string;
  role: "viewer" | "editor";
  invitedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

type StoryAccessContext = {
  isOwner: boolean;
  role: "owner" | "editor" | "viewer";
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
};

type CoCreationRoomParticipant = {
  userId: string;
  userLabel: string;
  activePanel: string | null;
  lastSeenAt: string;
  isCurrentUser: boolean;
};

type CoCreationRoom = {
  id: string;
  storyId: string;
  name: string;
  mode: string;
  objective: string | null;
  createdByUserId: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  activeParticipants: CoCreationRoomParticipant[];
  activeParticipantCount: number;
};

type CoEditConflict = {
  lockId: string;
  resource: string;
  lockedByUserId: string;
  lockedByUserLabel: string;
  reason: string | null;
  expiresAt: string;
  resolution: {
    summary: string;
    retryAfterSeconds: number;
    roomContexts: Array<{
      roomId: string;
      roomName: string;
      roomMode: string;
      lockerActive: boolean;
      requesterActive: boolean;
      sharedSession: boolean;
    }>;
    suggestedActions: Array<{
      code: string;
      label: string;
      description: string;
    }>;
  };
};

type CoCreationAuditEvent = {
  id: string;
  roomId: string | null;
  actorUserId: string;
  actorUserLabel: string;
  eventType: string;
  eventLabel: string;
  resource: string | null;
  targetUserId: string | null;
  targetUserLabel: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

function formatLockResource(resource: string) {
  if (resource === "story-title") return "Story Title";
  if (resource === "story-pages") return "Story Pages";
  if (resource === "character-bible") return "Character Bible";
  return resource;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleDateString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleString();
}

function formatRoomMode(mode: string) {
  if (mode === "writers_room") return "Writers Room";
  if (mode === "director_room") return "Director Room";
  if (mode === "continuity_room") return "Continuity Room";
  return mode.replaceAll("_", " ");
}

export function UniverseSheet({
  isOpen,
  onClose,
  storySlug,
  canManageCollaborators = false,
}: UniverseSheetProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [graph, setGraph] = useState<UniverseGraph | null>(null);
  const [activityFeed, setActivityFeed] = useState<UniverseActivityFeed | null>(
    null,
  );
  const [interactiveState, setInteractiveState] =
    useState<UniverseInteractiveState | null>(null);
  const [interactiveFocusStoryId, setInteractiveFocusStoryId] = useState<
    string | null
  >(null);
  const [activityWindowDays, setActivityWindowDays] = useState<1 | 7 | 14 | 30>(
    14,
  );
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [coCreationRooms, setCoCreationRooms] = useState<CoCreationRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomParticipants, setActiveRoomParticipants] = useState<
    CoCreationRoomParticipant[]
  >([]);
  const [roomDraftName, setRoomDraftName] = useState("Main Room");
  const [roomDraftMode, setRoomDraftMode] = useState<
    "writers_room" | "director_room" | "continuity_room"
  >("writers_room");
  const [roomDraftObjective, setRoomDraftObjective] = useState("");
  const [roomTransferDraft, setRoomTransferDraft] = useState<
    Record<string, string>
  >({});
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isRoomSessionSyncing, setIsRoomSessionSyncing] = useState(false);
  const [isSavingRoomId, setIsSavingRoomId] = useState<string | null>(null);
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [conflicts, setConflicts] = useState<CoEditConflict[]>([]);
  const [auditEvents, setAuditEvents] = useState<CoCreationAuditEvent[]>([]);
  const [conflictHandoffTargets, setConflictHandoffTargets] = useState<
    Record<string, string>
  >({});
  const [isResolvingConflictId, setIsResolvingConflictId] = useState<
    string | null
  >(null);
  const [access, setAccess] = useState<StoryAccessContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remixingStoryId, setRemixingStoryId] = useState<string | null>(null);
  const [collaboratorInput, setCollaboratorInput] = useState("");
  const [collaboratorRoleDraft, setCollaboratorRoleDraft] = useState<
    "viewer" | "editor"
  >("editor");
  const [syncingCollaboratorUserId, setSyncingCollaboratorUserId] = useState<
    string | null
  >(null);

  const loadUniverse = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoading(true);
    setIsLoadingConflicts(true);
    setIsLoadingAudit(true);
    setError(null);
    try {
      const interactiveParams = new URLSearchParams();
      if (interactiveFocusStoryId) {
        interactiveParams.set("focusStoryId", interactiveFocusStoryId);
      }
      interactiveParams.set("maxNodes", "60");

      const [
        { data: universeData },
        { data: collaboratorsData },
        { data: activityData },
        { data: interactiveData },
        { data: roomsData },
      ] = await Promise.all([
        requestJson<{ universe: UniverseGraph }>(`/api/stories/${storySlug}/universe`, {
          cache: "no-store",
          timeoutMs: 15000,
        }),
        requestJson<{ collaborators: Collaborator[]; access: StoryAccessContext }>(
          `/api/stories/${storySlug}/collaborators`,
          {
            cache: "no-store",
            timeoutMs: 12000,
          },
        ),
        requestJson<{ activity: UniverseActivityFeed }>(
          `/api/stories/${storySlug}/universe/activity?days=${activityWindowDays}&limit=24`,
          {
            cache: "no-store",
            timeoutMs: 12000,
          },
        ),
        requestJson<{ interactive: UniverseInteractiveState | null }>(
          `/api/stories/${storySlug}/universe/interactive?${interactiveParams.toString()}`,
          {
            cache: "no-store",
            timeoutMs: 12000,
          },
        ),
        requestJson<{ rooms: CoCreationRoom[] }>(
          `/api/stories/${storySlug}/co-creation/rooms?includeArchived=true`,
          {
            cache: "no-store",
            timeoutMs: 12000,
          },
        ),
      ]);
      setGraph(universeData.universe);
      setCollaborators(collaboratorsData.collaborators ?? []);
      setAccess(collaboratorsData.access ?? null);
      setActivityFeed(activityData.activity ?? null);
      setInteractiveState(interactiveData.interactive ?? null);
      const roomList = roomsData.rooms ?? [];
      setCoCreationRooms(roomList);
      setActiveRoomId((currentRoomId) => {
        if (currentRoomId && roomList.some((room) => room.id === currentRoomId)) {
          return currentRoomId;
        }

        const roomWithCurrentUser = roomList.find((room) =>
          room.activeParticipants.some((participant) => participant.isCurrentUser),
        );
        return roomWithCurrentUser?.id ?? roomList[0]?.id ?? null;
      });
      const resolvedFocus = interactiveData.interactive?.focusStoryId ?? null;
      if (resolvedFocus && resolvedFocus !== interactiveFocusStoryId) {
        setInteractiveFocusStoryId(resolvedFocus);
      }

      const [conflictsResult, auditResult] = await Promise.allSettled([
        requestJson<{ conflicts: CoEditConflict[] }>(
          `/api/stories/${storySlug}/co-creation/conflicts`,
          {
            cache: "no-store",
            timeoutMs: 12000,
          },
        ),
        requestJson<{ events: CoCreationAuditEvent[] }>(
          `/api/stories/${storySlug}/co-creation/audit?limit=40`,
          {
            cache: "no-store",
            timeoutMs: 12000,
          },
        ),
      ]);

      if (conflictsResult.status === "fulfilled") {
        setConflicts(conflictsResult.value.data.conflicts ?? []);
      } else {
        setConflicts([]);
      }

      if (auditResult.status === "fulfilled") {
        setAuditEvents(auditResult.value.data.events ?? []);
      } else {
        setAuditEvents([]);
      }
    } catch (requestError) {
      setActivityFeed(null);
      setInteractiveState(null);
      setCoCreationRooms([]);
      setActiveRoomParticipants([]);
      setConflicts([]);
      setAuditEvents([]);
      const description =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Failed to load shared universe.";
      setError(description);
    } finally {
      setIsLoading(false);
      setIsLoadingConflicts(false);
      setIsLoadingAudit(false);
    }
  }, [activityWindowDays, interactiveFocusStoryId, storySlug]);

  useEffect(() => {
    if (isOpen) {
      void loadUniverse();
    }
  }, [isOpen, loadUniverse]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadUniverse();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [isOpen, loadUniverse]);

  const depthGroups = useMemo(() => {
    if (!graph) {
      return [];
    }

    const grouped = new Map<number, UniverseNode[]>();
    graph.nodes.forEach((node) => {
      const existing = grouped.get(node.depth) ?? [];
      existing.push(node);
      grouped.set(node.depth, existing);
    });

    return Array.from(grouped.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([depth, nodes]) => ({
        depth,
        nodes,
      }));
  }, [graph]);

  const nodeMap = useMemo(() => {
    return new Map(graph?.nodes.map((node) => [node.id, node]) ?? []);
  }, [graph]);

  const handleRemixFromNode = useCallback(
    async (node: UniverseNode) => {
      if (remixingStoryId) {
        return;
      }

      setRemixingStoryId(node.id);
      try {
        const { data } = await requestJson<{
          story: {
            id: string;
            slug: string;
            title: string;
          };
        }>(`/api/stories/${node.slug}/remix`, {
          method: "POST",
        });

        toast({
          title: "Universe branch created",
          description: `New branch: ${data.story.title}`,
          duration: 2200,
        });
        onClose();
        router.push(`/story/${data.story.slug}`);
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not create universe branch.";
        toast({
          title: "Branching failed",
          description,
          variant: "destructive",
          duration: 3500,
        });
      } finally {
        setRemixingStoryId(null);
      }
    },
    [onClose, remixingStoryId, router, toast],
  );

  const canManageUniverseCollaborators =
    canManageCollaborators || access?.canManage === true;
  const canEditRooms = access?.canEdit === true;
  const canManageRooms = access?.canManage === true;
  const activeRoom = useMemo(
    () => coCreationRooms.find((room) => room.id === activeRoomId) ?? null,
    [activeRoomId, coCreationRooms],
  );
  const inferredCurrentUserId = useMemo(() => {
    for (const room of coCreationRooms) {
      const participant = room.activeParticipants.find(
        (entry) => entry.isCurrentUser,
      );
      if (participant) {
        return participant.userId;
      }
    }
    return (
      activeRoomParticipants.find((participant) => participant.isCurrentUser)
        ?.userId ?? null
    );
  }, [activeRoomParticipants, coCreationRooms]);
  const canManageActiveRoom =
    !!activeRoom &&
    (canManageRooms ||
      (!!inferredCurrentUserId &&
        activeRoom.createdByUserId === inferredCurrentUserId));

  const editorCandidates = useMemo(() => {
    const candidateMap = new Map<string, string>();

    collaborators.forEach((collaborator) => {
      if (collaborator.role === "editor") {
        candidateMap.set(collaborator.userId, collaborator.userId);
      }
    });

    coCreationRooms.forEach((room) => {
      room.activeParticipants.forEach((participant) => {
        if (!candidateMap.has(participant.userId)) {
          candidateMap.set(participant.userId, participant.userLabel);
        }
      });
    });

    conflicts.forEach((conflict) => {
      if (!candidateMap.has(conflict.lockedByUserId)) {
        candidateMap.set(conflict.lockedByUserId, conflict.lockedByUserLabel);
      }
    });

    return Array.from(candidateMap.entries())
      .map(([userId, label]) => ({ userId, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [coCreationRooms, collaborators, conflicts]);

  const runConflictAction = useCallback(
    async ({
      conflict,
      action,
      targetUserId,
    }: {
      conflict: CoEditConflict;
      action: "request_release" | "handoff_lock";
      targetUserId?: string;
    }) => {
      setIsResolvingConflictId(conflict.lockId);
      try {
        const { data } = await requestJson<{
          success: boolean;
          message: string;
          conflicts: CoEditConflict[];
        }>(`/api/stories/${storySlug}/co-creation/conflicts`, {
          method: "POST",
          body: {
            action,
            resource: conflict.resource,
            targetUserId,
          },
        });
        setConflicts(data.conflicts ?? []);
        toast({
          title: "Conflict action applied",
          description: data.message || "Conflict state updated.",
          duration: 2200,
        });
        void loadUniverse();
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not apply conflict action.";
        toast({
          title: "Conflict action failed",
          description,
          variant: "destructive",
          duration: 3500,
        });
      } finally {
        setIsResolvingConflictId(null);
      }
    },
    [loadUniverse, storySlug, toast],
  );

  const archiveRoom = useCallback(
    async (roomId: string) => {
      if (!roomId || !canEditRooms) {
        return;
      }

      setIsSavingRoomId(roomId);
      try {
        const { data } = await requestJson<{ message: string }>(
          `/api/stories/${storySlug}/co-creation/rooms/${roomId}`,
          {
            method: "PATCH",
            body: {
              action: "archive",
            },
          },
        );
        toast({
          title: "Room archived",
          description: data.message || "Room archived and participants exited.",
          duration: 2200,
        });
        void loadUniverse();
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not archive room.";
        toast({
          title: "Archive failed",
          description,
          variant: "destructive",
          duration: 3500,
        });
      } finally {
        setIsSavingRoomId(null);
      }
    },
    [canEditRooms, loadUniverse, storySlug, toast],
  );

  const transferRoomOwner = useCallback(
    async (roomId: string) => {
      if (!roomId || !canEditRooms) {
        return;
      }

      const targetUserId = roomTransferDraft[roomId]?.trim() ?? "";
      if (!targetUserId) {
        toast({
          title: "Missing target",
          description: "Enter a target user ID to transfer room ownership.",
          variant: "destructive",
          duration: 2600,
        });
        return;
      }

      setIsSavingRoomId(roomId);
      try {
        const { data } = await requestJson<{ message: string }>(
          `/api/stories/${storySlug}/co-creation/rooms/${roomId}`,
          {
            method: "PATCH",
            body: {
              action: "transfer_owner",
              targetUserId,
            },
          },
        );
        setRoomTransferDraft((current) => ({
          ...current,
          [roomId]: "",
        }));
        toast({
          title: "Ownership transferred",
          description: data.message || "Room ownership transferred.",
          duration: 2200,
        });
        void loadUniverse();
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not transfer room ownership.";
        toast({
          title: "Transfer failed",
          description,
          variant: "destructive",
          duration: 3500,
        });
      } finally {
        setIsSavingRoomId(null);
      }
    },
    [canEditRooms, loadUniverse, roomTransferDraft, storySlug, toast],
  );

  const addCollaborator = useCallback(async () => {
    const collaboratorUserId = collaboratorInput.trim();
    if (!collaboratorUserId) {
      return;
    }

    setSyncingCollaboratorUserId(collaboratorUserId);
    try {
      const { data } = await requestJson<{ collaborators: Collaborator[] }>(
        `/api/stories/${storySlug}/collaborators`,
        {
          method: "PUT",
          body: {
            collaboratorUserId,
            role: collaboratorRoleDraft,
          },
        },
      );
      setCollaborators(data.collaborators ?? []);
      setCollaboratorInput("");
      toast({
        title: "Collaborator saved",
        description: "Shared editing access updated.",
        duration: 2000,
      });
    } catch (requestError) {
      const description =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not save collaborator.";
      toast({
        title: "Collaborator update failed",
        description,
        variant: "destructive",
        duration: 3500,
      });
    } finally {
      setSyncingCollaboratorUserId(null);
    }
  }, [collaboratorInput, collaboratorRoleDraft, storySlug, toast]);

  const setCollaboratorRole = useCallback(
    async (collaboratorUserId: string, role: "viewer" | "editor") => {
      setSyncingCollaboratorUserId(collaboratorUserId);
      try {
        const { data } = await requestJson<{ collaborators: Collaborator[] }>(
          `/api/stories/${storySlug}/collaborators`,
          {
            method: "PUT",
            body: {
              collaboratorUserId,
              role,
            },
          },
        );
        setCollaborators(data.collaborators ?? []);
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not update role.";
        toast({
          title: "Role update failed",
          description,
          variant: "destructive",
          duration: 3200,
        });
      } finally {
        setSyncingCollaboratorUserId(null);
      }
    },
    [storySlug, toast],
  );

  const removeCollaborator = useCallback(
    async (collaboratorUserId: string) => {
      setSyncingCollaboratorUserId(collaboratorUserId);
      try {
        const { data } = await requestJson<{ collaborators: Collaborator[] }>(
          `/api/stories/${storySlug}/collaborators`,
          {
            method: "DELETE",
            body: {
              collaboratorUserId,
            },
          },
        );
        setCollaborators(data.collaborators ?? []);
        toast({
          title: "Collaborator removed",
          description: "Shared access revoked.",
          duration: 1800,
        });
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not remove collaborator.";
        toast({
          title: "Remove failed",
          description,
          variant: "destructive",
          duration: 3200,
        });
      } finally {
        setSyncingCollaboratorUserId(null);
      }
    },
    [storySlug, toast],
  );

  const loadRoomSession = useCallback(
    async (roomId: string, { silent = true }: { silent?: boolean } = {}) => {
      if (!storySlug || !roomId) {
        return;
      }

      setIsRoomSessionSyncing(true);
      try {
        const { data } = await requestJson<{
          participants: CoCreationRoomParticipant[];
          participantCount: number;
        }>(`/api/stories/${storySlug}/co-creation/rooms/${roomId}/session`, {
          cache: "no-store",
          timeoutMs: 9000,
        });
        setActiveRoomParticipants(data.participants ?? []);
      } catch (requestError) {
        if (!silent) {
          const description =
            requestError instanceof ClientApiError
              ? requestError.requestId
                ? `${requestError.message} (ref: ${requestError.requestId})`
                : requestError.message
              : "Could not refresh room session.";
          toast({
            title: "Room sync failed",
            description,
            variant: "destructive",
            duration: 3200,
          });
        }
      } finally {
        setIsRoomSessionSyncing(false);
      }
    },
    [storySlug, toast],
  );

  const joinRoom = useCallback(
    async (roomId: string) => {
      if (!storySlug || !roomId || !canEditRooms) {
        return;
      }

      setIsRoomSessionSyncing(true);
      try {
        const { data } = await requestJson<{
          participants: CoCreationRoomParticipant[];
          participantCount: number;
        }>(`/api/stories/${storySlug}/co-creation/rooms/${roomId}/session`, {
          method: "POST",
          body: {
            activePanel: "universe",
          },
        });
        setActiveRoomId(roomId);
        setActiveRoomParticipants(data.participants ?? []);
        toast({
          title: "Joined room session",
          description: "You are now active in this co-creation room.",
          duration: 1800,
        });
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not join room.";
        toast({
          title: "Join failed",
          description,
          variant: "destructive",
          duration: 3200,
        });
      } finally {
        setIsRoomSessionSyncing(false);
      }
    },
    [canEditRooms, storySlug, toast],
  );

  const leaveRoom = useCallback(
    async (roomId: string) => {
      if (!storySlug || !roomId || !canEditRooms) {
        return;
      }

      setIsRoomSessionSyncing(true);
      try {
        await requestJson<{ participants: CoCreationRoomParticipant[] }>(
          `/api/stories/${storySlug}/co-creation/rooms/${roomId}/session`,
          {
            method: "DELETE",
          },
        );
        setActiveRoomParticipants((participants) =>
          participants.filter((participant) => !participant.isCurrentUser),
        );
        toast({
          title: "Left room session",
          description: "You are no longer active in this room.",
          duration: 1800,
        });
      } catch (requestError) {
        const description =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not leave room.";
        toast({
          title: "Leave failed",
          description,
          variant: "destructive",
          duration: 3200,
        });
      } finally {
        setIsRoomSessionSyncing(false);
      }
    },
    [canEditRooms, storySlug, toast],
  );

  const createRoom = useCallback(async () => {
    const name = roomDraftName.trim();
    if (name.length < 2) {
      return;
    }

    setIsCreatingRoom(true);
    try {
      const { data } = await requestJson<{
        room: { id: string };
        rooms: CoCreationRoom[];
      }>(`/api/stories/${storySlug}/co-creation/rooms`, {
        method: "POST",
        body: {
          name,
          mode: roomDraftMode,
          objective: roomDraftObjective.trim() || null,
          autoJoin: true,
        },
      });
      const rooms = data.rooms ?? [];
      setCoCreationRooms(rooms);
      setActiveRoomId(data.room?.id ?? rooms[0]?.id ?? null);
      setRoomDraftName("Main Room");
      setRoomDraftObjective("");
      toast({
        title: "Co-creation room created",
        description: "Room is live and ready for collaborators.",
        duration: 2200,
      });
    } catch (requestError) {
      const description =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not create room.";
      toast({
        title: "Create room failed",
        description,
        variant: "destructive",
        duration: 3200,
      });
    } finally {
      setIsCreatingRoom(false);
    }
  }, [roomDraftName, roomDraftMode, roomDraftObjective, storySlug, toast]);

  useEffect(() => {
    if (!isOpen || !activeRoomId) {
      return;
    }

    const activeRoom = coCreationRooms.find((room) => room.id === activeRoomId);
    if (activeRoom) {
      setActiveRoomParticipants(activeRoom.activeParticipants ?? []);
    }
  }, [activeRoomId, coCreationRooms, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeRoomId) {
      return;
    }

    void loadRoomSession(activeRoomId, { silent: true });
    const intervalId = window.setInterval(() => {
      void loadRoomSession(activeRoomId, { silent: true });
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [activeRoomId, isOpen, loadRoomSession]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl border-l border-white/10 comic-surface px-6">
        <SheetHeader className="pb-4 border-b border-white/10 px-0">
          <SheetTitle className="text-base font-medium text-white flex items-center gap-2 comic-title-gradient">
            <Orbit className="w-4 h-4 text-[#43c0ff]" />
            Shared Universe
          </SheetTitle>
        </SheetHeader>

        <div className="py-5 space-y-4 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
          <div className="comic-surface border border-white/10 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Universe Activity
                </p>
                <p className="text-sm text-white mt-1">
                  Navigate branches, open any storyline, or fork from any node.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-white/20"
                onClick={() => {
                  void loadUniverse();
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>
            {graph ? (
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div className="rounded-md border border-white/10 px-2 py-1.5 text-center">
                  <p className="text-muted-foreground">Stories</p>
                  <p className="text-white font-medium">{graph.totalStories}</p>
                </div>
                <div className="rounded-md border border-white/10 px-2 py-1.5 text-center">
                  <p className="text-muted-foreground">Branches</p>
                  <p className="text-white font-medium">{graph.totalEdges}</p>
                </div>
                <div className="rounded-md border border-white/10 px-2 py-1.5 text-center">
                  <p className="text-muted-foreground">Max Depth</p>
                  <p className="text-white font-medium">{graph.maxDepth}</p>
                </div>
              </div>
            ) : null}
          </div>

          <section className="comic-surface border border-white/10 rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Universe Feed
                </p>
                <p className="text-sm text-white mt-1">
                  Live branch activity across this shared universe graph.
                </p>
              </div>
              <select
                value={activityWindowDays}
                onChange={(event) =>
                  setActivityWindowDays(
                    Number(event.target.value) as 1 | 7 | 14 | 30,
                  )
                }
                className="h-8 px-2 rounded-md border border-white/15 bg-black/40 text-xs text-white"
              >
                <option value={1}>24h</option>
                <option value={7}>7d</option>
                <option value={14}>14d</option>
                <option value={30}>30d</option>
              </select>
            </div>

            {activityFeed ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-white/10 px-2 py-1.5">
                    <p className="text-muted-foreground">Recent events</p>
                    <p className="text-white font-medium">{activityFeed.eventCount}</p>
                  </div>
                  <div className="rounded-md border border-white/10 px-2 py-1.5">
                    <p className="text-muted-foreground">Top active branches</p>
                    <p className="text-white font-medium">
                      {activityFeed.activeBranches.length}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {activityFeed.events.length === 0 ? (
                    <div className="text-xs text-muted-foreground border border-white/10 rounded-md px-3 py-2">
                      No recent universe events for the selected time window.
                    </div>
                  ) : (
                    activityFeed.events.slice(0, 8).map((event) => (
                      <div
                        key={event.id}
                        className="rounded-md border border-white/10 bg-black/30 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-white truncate">{event.storyTitle}</p>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {formatDateTime(event.happenedAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.message}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-white/20 text-xs"
                            onClick={() => {
                              onClose();
                              router.push(`/story/${event.storySlug}`);
                            }}
                          >
                            Open
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 comic-nav-btn-primary text-xs"
                            onClick={() => {
                              const activityNode = nodeMap.get(event.storyId);
                              if (activityNode) {
                                void handleRemixFromNode(activityNode);
                              } else {
                                onClose();
                                router.push(`/story/${event.storySlug}`);
                              }
                            }}
                            disabled={remixingStoryId === event.storyId}
                          >
                            {remixingStoryId === event.storyId ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <GitBranch className="w-3 h-3 mr-1" />
                            )}
                            Branch
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {activityFeed.activeBranches.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-2">
                      Most Active Branches
                    </p>
                    <div className="space-y-1.5">
                      {activityFeed.activeBranches.slice(0, 5).map((branch) => (
                        <div
                          key={`active-${branch.storyId}`}
                          className="rounded-md border border-white/10 px-2.5 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">
                              {branch.storyTitle}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {branch.remixCount} remixes • Updated{" "}
                              {formatDate(branch.updatedAt)}
                            </p>
                          </div>
                          <Clock3 className="w-3.5 h-3.5 text-[#43c0ff] shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground">
                Loading universe activity...
              </div>
            )}
          </section>

          <section className="comic-surface border border-white/10 rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Interactive Universe Run
                </p>
                <p className="text-sm text-white mt-1">
                  Explore branch episodes, jump timelines, and steer next branch picks.
                </p>
              </div>
              <Compass className="w-4 h-4 text-[#43c0ff] mt-0.5" />
            </div>

            {interactiveState ? (
              <>
                <div className="mt-3 rounded-md border border-white/10 bg-black/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Current Episode</p>
                  <p className="text-sm text-white mt-1">
                    {interactiveState.episode.storyTitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Depth {interactiveState.episode.depth} • Updated{" "}
                    {formatDate(interactiveState.episode.updatedAt)}
                    {interactiveState.episode.style
                      ? ` • ${interactiveState.episode.style}`
                      : ""}
                  </p>
                  <p className="text-xs text-[#c7d6ff] mt-2">
                    {interactiveState.episode.promptHint}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {interactiveState.path.map((pathNode) => (
                    <button
                      key={`path-${pathNode.storyId}`}
                      type="button"
                      onClick={() => setInteractiveFocusStoryId(pathNode.storyId)}
                      className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                        pathNode.isFocus
                          ? "border-[#43c0ff]/45 bg-[#43c0ff]/15 text-[#a8ddff]"
                          : "border-white/15 bg-black/35 text-muted-foreground hover:text-white"
                      }`}
                    >
                      {pathNode.storyTitle}
                    </button>
                  ))}
                </div>

                {interactiveState.episode.parent ? (
                  <div className="mt-3 rounded-md border border-white/10 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Parent Episode</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-sm text-white truncate">
                        {interactiveState.episode.parent.storyTitle}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-white/20 text-xs"
                        onClick={() =>
                          setInteractiveFocusStoryId(
                            interactiveState.episode.parent?.storyId ?? null,
                          )
                        }
                      >
                        Focus
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Branch Choices
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {interactiveState.episode.branches.length} available
                    </span>
                  </div>

                  {interactiveState.episode.branches.length === 0 ? (
                    <div className="mt-2 text-xs text-muted-foreground border border-white/10 rounded-md px-3 py-2">
                      No child branches yet. Start one from this episode.
                      <div className="mt-2">
                        <Button
                          size="sm"
                          className="h-7 comic-nav-btn-primary text-xs"
                          onClick={() => {
                            const focusNode = nodeMap.get(interactiveState.focusStoryId);
                            if (focusNode) {
                              void handleRemixFromNode(focusNode);
                            }
                          }}
                          disabled={remixingStoryId === interactiveState.focusStoryId}
                        >
                          {remixingStoryId === interactiveState.focusStoryId ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <GitBranch className="w-3 h-3 mr-1" />
                          )}
                          Branch This Episode
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {interactiveState.episode.branches.slice(0, 8).map((branch) => {
                        const isRecommended =
                          interactiveState.recommendation.primaryBranchStoryId ===
                          branch.storyId;
                        return (
                          <div
                            key={`choice-${branch.storyId}`}
                            className={`rounded-md border px-3 py-2 ${
                              isRecommended
                                ? "border-[#43c0ff]/45 bg-[#43c0ff]/10"
                                : "border-white/10 bg-black/25"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm text-white truncate">{branch.storyTitle}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {branch.remixCount} remixes • {branch.velocity}
                                  {" • "}
                                  {formatDate(branch.updatedAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-white/20 text-xs"
                                  onClick={() => setInteractiveFocusStoryId(branch.storyId)}
                                >
                                  Focus
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-white/20 text-xs"
                                  onClick={() => {
                                    onClose();
                                    router.push(`/story/${branch.storySlug}`);
                                  }}
                                >
                                  Open
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 comic-nav-btn-primary text-xs"
                                  onClick={() => {
                                    const branchNode = nodeMap.get(branch.storyId);
                                    if (branchNode) {
                                      void handleRemixFromNode(branchNode);
                                    }
                                  }}
                                  disabled={remixingStoryId === branch.storyId}
                                >
                                  {remixingStoryId === branch.storyId ? (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  ) : (
                                    <GitBranch className="w-3 h-3 mr-1" />
                                  )}
                                  Branch
                                </Button>
                              </div>
                            </div>
                            {isRecommended ? (
                              <p className="text-[11px] text-[#9fddff] mt-1">
                                Recommended: {interactiveState.recommendation.reason}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground">
                Building interactive universe state...
              </div>
            )}
          </section>

          <section className="comic-surface border border-white/10 rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Conflict Center
                </p>
                <p className="text-sm text-white mt-1">
                  Resolve lock conflicts with guided handoffs and release requests.
                </p>
              </div>
              <AlertTriangle className="w-4 h-4 text-[#ffd66e] mt-0.5" />
            </div>

            {isLoadingConflicts ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading active conflicts...
              </div>
            ) : conflicts.length === 0 ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-emerald-300">
                No active lock conflicts right now.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {conflicts.map((conflict) => {
                  const handoffTarget = conflictHandoffTargets[conflict.lockId] ?? "";
                  return (
                    <div
                      key={`conflict-${conflict.lockId}`}
                      className="rounded-md border border-[#ffd66e]/30 bg-[#ffd66e]/5 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-white">
                            {formatLockResource(conflict.resource)}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Locked by {conflict.lockedByUserLabel} • Expires{" "}
                            {formatDateTime(conflict.expiresAt)}
                          </p>
                        </div>
                        <span className="text-[11px] text-[#ffd66e] whitespace-nowrap">
                          retry ~{conflict.resolution.retryAfterSeconds}s
                        </span>
                      </div>

                      <p className="text-xs text-[#f6e4b0] mt-2">
                        {conflict.resolution.summary}
                      </p>

                      {conflict.resolution.roomContexts.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {conflict.resolution.roomContexts.map((roomContext) => (
                            <button
                              key={`ctx-${conflict.lockId}-${roomContext.roomId}`}
                              type="button"
                              onClick={() => setActiveRoomId(roomContext.roomId)}
                              className="h-6 rounded-md border border-white/20 bg-black/20 px-2 text-[11px] text-[#c7d6ff] hover:text-white transition-colors"
                            >
                              {roomContext.roomName}
                              {roomContext.sharedSession ? " • shared" : ""}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-white/20 text-xs"
                          onClick={() => {
                            void runConflictAction({
                              conflict,
                              action: "request_release",
                            });
                          }}
                          disabled={isResolvingConflictId === conflict.lockId}
                        >
                          {isResolvingConflictId === conflict.lockId ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : null}
                          Request Release
                        </Button>

                        {canManageRooms ? (
                          <>
                            <select
                              value={handoffTarget}
                              onChange={(event) =>
                                setConflictHandoffTargets((current) => ({
                                  ...current,
                                  [conflict.lockId]: event.target.value,
                                }))
                              }
                              className="h-7 rounded-md border border-white/20 bg-black/30 px-2 text-xs text-white"
                            >
                              <option value="">Handoff target...</option>
                              {editorCandidates.map((candidate) => (
                                <option key={candidate.userId} value={candidate.userId}>
                                  {candidate.label} ({candidate.userId})
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              className="h-7 comic-nav-btn-primary text-xs"
                              onClick={() => {
                                if (!handoffTarget) {
                                  return;
                                }
                                void runConflictAction({
                                  conflict,
                                  action: "handoff_lock",
                                  targetUserId: handoffTarget,
                                });
                              }}
                              disabled={
                                isResolvingConflictId === conflict.lockId ||
                                handoffTarget.length === 0
                              }
                            >
                              <ArrowRightLeft className="w-3 h-3 mr-1" />
                              Handoff
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="comic-surface border border-white/10 rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Co-Creation Rooms
                </p>
                <p className="text-sm text-white mt-1">
                  Start focused room sessions for writing, direction, or continuity work.
                </p>
              </div>
              <Users className="w-4 h-4 text-[#43c0ff] mt-0.5" />
            </div>

            {canEditRooms ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/25 px-3 py-3 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={roomDraftName}
                    onChange={(event) => setRoomDraftName(event.target.value)}
                    placeholder="Room name"
                    className="flex-1 h-9 px-3 rounded-md border border-white/15 bg-black/40 text-sm text-white placeholder:text-muted-foreground"
                  />
                  <select
                    value={roomDraftMode}
                    onChange={(event) =>
                      setRoomDraftMode(
                        event.target.value as
                          | "writers_room"
                          | "director_room"
                          | "continuity_room",
                      )
                    }
                    className="h-9 px-2 rounded-md border border-white/15 bg-black/40 text-sm text-white"
                  >
                    <option value="writers_room">Writers Room</option>
                    <option value="director_room">Director Room</option>
                    <option value="continuity_room">Continuity Room</option>
                  </select>
                  <Button
                    size="sm"
                    className="h-9 comic-nav-btn-primary"
                    onClick={() => {
                      void createRoom();
                    }}
                    disabled={isCreatingRoom || roomDraftName.trim().length < 2}
                  >
                    {isCreatingRoom ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Create
                  </Button>
                </div>
                <input
                  value={roomDraftObjective}
                  onChange={(event) => setRoomDraftObjective(event.target.value)}
                  placeholder="Objective (optional)"
                  className="w-full h-9 px-3 rounded-md border border-white/15 bg-black/40 text-sm text-white placeholder:text-muted-foreground"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-3">
                You can join active room sessions, but only editors can create rooms.
              </p>
            )}

            <div className="mt-3 space-y-2">
              {coCreationRooms.length === 0 ? (
                <div className="text-xs text-muted-foreground border border-white/10 rounded-md px-3 py-2">
                  No rooms yet. Create one to start focused co-creation sessions.
                </div>
              ) : (
                coCreationRooms.map((room) => {
                  const isActiveRoom = activeRoomId === room.id;
                  const currentUserActive = room.activeParticipants.some(
                    (participant) => participant.isCurrentUser,
                  );
                  const isArchivedRoom = room.isArchived;
                  return (
                    <div
                      key={`room-${room.id}`}
                      className={`rounded-md border px-3 py-2 ${
                        isActiveRoom
                          ? "border-[#43c0ff]/40 bg-[#43c0ff]/10"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{room.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatRoomMode(room.mode)} • Updated{" "}
                            {formatDateTime(room.updatedAt)}
                          </p>
                          {isArchivedRoom ? (
                            <p className="text-[11px] text-amber-300 mt-1">
                              Archived room
                            </p>
                          ) : null}
                          {room.objective ? (
                            <p className="text-xs text-[#c7d6ff] mt-1 line-clamp-2">
                              {room.objective}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-white/20 text-xs"
                            onClick={() => setActiveRoomId(room.id)}
                          >
                            Focus
                          </Button>
                          {!canEditRooms || isArchivedRoom ? (
                            <span className="text-[11px] text-muted-foreground px-2 py-1 border border-white/10 rounded-md">
                              {isArchivedRoom ? "Archived" : "View only"}
                            </span>
                          ) : currentUserActive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-red-400/40 text-xs text-red-200 hover:bg-red-500/10"
                              onClick={() => {
                                void leaveRoom(room.id);
                              }}
                              disabled={isRoomSessionSyncing}
                            >
                              Leave
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 comic-nav-btn-primary text-xs"
                              onClick={() => {
                                void joinRoom(room.id);
                              }}
                              disabled={isRoomSessionSyncing}
                            >
                              {isRoomSessionSyncing && isActiveRoom ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : null}
                              Join
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        {room.activeParticipantCount} active participant
                        {room.activeParticipantCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {activeRoomId ? (
              <div className="mt-3 rounded-md border border-white/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Active Room Session
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-white/20 text-xs"
                    onClick={() => {
                      void loadRoomSession(activeRoomId, { silent: false });
                    }}
                    disabled={isRoomSessionSyncing}
                  >
                    {isRoomSessionSyncing ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    Sync
                  </Button>
                </div>
                {activeRoomParticipants.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    No active participants in this room yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {activeRoomParticipants.map((participant) => (
                      <div
                        key={`participant-${activeRoomId}-${participant.userId}`}
                        className="flex items-center justify-between gap-2 text-xs border border-white/10 rounded-md px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="text-white truncate">
                            {participant.userLabel}
                            {participant.isCurrentUser ? " (you)" : ""}
                          </p>
                          <p className="text-muted-foreground">
                            {participant.activePanel ?? "editor"} •{" "}
                            {formatDateTime(participant.lastSeenAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {canManageActiveRoom ? (
                  <div className="mt-3 rounded-md border border-white/10 bg-black/25 px-2.5 py-2.5 space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Room Governance
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={roomTransferDraft[activeRoomId] ?? ""}
                        onChange={(event) =>
                          setRoomTransferDraft((current) => ({
                            ...current,
                            [activeRoomId]: event.target.value,
                          }))
                        }
                        placeholder="Transfer owner to user ID"
                        className="flex-1 h-8 px-2 rounded-md border border-white/15 bg-black/35 text-xs text-white placeholder:text-muted-foreground"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/20 text-xs"
                        onClick={() => {
                          void transferRoomOwner(activeRoomId);
                        }}
                        disabled={isSavingRoomId === activeRoomId}
                      >
                        {isSavingRoomId === activeRoomId ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="w-3 h-3 mr-1" />
                        )}
                        Transfer Owner
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-red-400/40 text-xs text-red-200 hover:bg-red-500/10"
                        onClick={() => {
                          void archiveRoom(activeRoomId);
                        }}
                        disabled={isSavingRoomId === activeRoomId}
                      >
                        {isSavingRoomId === activeRoomId ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Archive className="w-3 h-3 mr-1" />
                        )}
                        Archive Room
                      </Button>
                    </div>
                  </div>
                ) : canEditRooms ? (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Governance actions are available to the active room owner or story admins.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="comic-surface border border-white/10 rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Governance Audit
                </p>
                <p className="text-sm text-white mt-1">
                  Trace room and lock operations with a durable event trail.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-white/20 text-xs"
                onClick={() => {
                  void loadUniverse();
                }}
                disabled={isLoadingAudit}
              >
                {isLoadingAudit ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                Refresh
              </Button>
            </div>
            {isLoadingAudit ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Loading audit events...
              </div>
            ) : auditEvents.length === 0 ? (
              <div className="mt-3 text-xs text-muted-foreground border border-white/10 rounded-md px-3 py-2">
                No audit events yet.
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {auditEvents.slice(0, 16).map((event) => (
                  <div
                    key={`audit-${event.id}`}
                    className="rounded-md border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-white">{event.eventLabel}</p>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {event.actorUserLabel}
                      {event.targetUserLabel
                        ? ` → ${event.targetUserLabel}`
                        : ""}{" "}
                      {event.resource
                        ? `• ${formatLockResource(event.resource)}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="comic-surface border border-white/10 rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Collaborator Access Controls
                </p>
                <p className="text-sm text-white mt-1">
                  Add collaborators and control story editing permissions.
                </p>
              </div>
              {access ? (
                <span className="text-[11px] px-2 py-1 rounded-md border border-white/10 bg-black/40 text-muted-foreground uppercase tracking-wider">
                  {access.role}
                </span>
              ) : null}
            </div>

            {canManageUniverseCollaborators ? (
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  value={collaboratorInput}
                  onChange={(event) => setCollaboratorInput(event.target.value)}
                  placeholder="Collaborator Clerk user ID"
                  className="flex-1 h-9 px-3 rounded-md border border-white/15 bg-black/40 text-sm text-white placeholder:text-muted-foreground"
                />
                <select
                  value={collaboratorRoleDraft}
                  onChange={(event) =>
                    setCollaboratorRoleDraft(event.target.value as "viewer" | "editor")
                  }
                  className="h-9 px-2 rounded-md border border-white/15 bg-black/40 text-sm text-white"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button
                  size="sm"
                  className="h-9 comic-nav-btn-primary"
                  onClick={() => {
                    void addCollaborator();
                  }}
                  disabled={
                    syncingCollaboratorUserId !== null || collaboratorInput.trim().length === 0
                  }
                >
                  {syncingCollaboratorUserId === collaboratorInput.trim() ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Add
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-3">
                You can view collaborators, but only the story owner can manage them.
              </p>
            )}

            <div className="space-y-2 mt-3">
              {collaborators.length === 0 ? (
                <div className="text-xs text-muted-foreground border border-white/10 rounded-md px-3 py-2">
                  No collaborators yet.
                </div>
              ) : (
                collaborators.map((collaborator) => (
                  <div
                    key={collaborator.id}
                    className="flex items-center justify-between gap-2 border border-white/10 rounded-md px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{collaborator.userId}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Added {formatDate(collaborator.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] px-2 py-1 rounded-md border border-white/10 bg-black/40 text-muted-foreground uppercase tracking-wider">
                        {collaborator.role}
                      </span>
                      {canManageUniverseCollaborators ? (
                        <>
                          {collaborator.role !== "editor" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-white/20 text-xs"
                              onClick={() => {
                                void setCollaboratorRole(collaborator.userId, "editor");
                              }}
                              disabled={syncingCollaboratorUserId === collaborator.userId}
                            >
                              Editor
                            </Button>
                          ) : null}
                          {collaborator.role !== "viewer" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-white/20 text-xs"
                              onClick={() => {
                                void setCollaboratorRole(collaborator.userId, "viewer");
                              }}
                              disabled={syncingCollaboratorUserId === collaborator.userId}
                            >
                              Viewer
                            </Button>
                          ) : null}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-300 hover:text-red-200 hover:bg-red-500/10"
                            onClick={() => {
                              void removeCollaborator(collaborator.userId);
                            }}
                            disabled={syncingCollaboratorUserId === collaborator.userId}
                          >
                            {syncingCollaboratorUserId === collaborator.userId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {error ? (
            <div className="comic-surface border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {isLoading && !graph ? (
            <div className="comic-surface border border-white/10 rounded-lg px-4 py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading universe graph...
            </div>
          ) : null}

          {!isLoading && graph && graph.nodes.length === 0 ? (
            <div className="comic-surface border border-white/10 rounded-lg px-4 py-8 text-center text-sm text-muted-foreground">
              This story has no universe graph yet.
            </div>
          ) : null}

          {depthGroups.map((group) => (
            <section key={`depth-${group.depth}`} className="space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <Network className="w-3.5 h-3.5 text-[#43c0ff]" />
                Depth {group.depth}
              </div>

              <div className="space-y-2">
                {group.nodes.map((node) => {
                  const parentNode = node.parentStoryId
                    ? nodeMap.get(node.parentStoryId)
                    : null;

                  return (
                    <div
                      key={node.id}
                      className={`rounded-lg border px-3 py-3 ${
                        node.isCurrent
                          ? "border-[#43c0ff]/50 bg-[#43c0ff]/10"
                          : "border-white/10 comic-surface"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {node.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Updated {formatDate(node.updatedAt)}
                            {node.style ? ` • ${node.style}` : ""}
                          </p>
                          {node.isRoot ? (
                            <p className="text-[11px] text-[#ffb26b] mt-1">
                              Root Timeline
                            </p>
                          ) : null}
                          {node.isCurrent ? (
                            <p className="text-[11px] text-[#43c0ff] mt-1">
                              Current Story
                            </p>
                          ) : null}
                          {parentNode ? (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Forked from {parentNode.title}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-white/20"
                            onClick={() => {
                              onClose();
                              router.push(`/story/${node.slug}`);
                            }}
                          >
                            Open
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 comic-nav-btn-primary"
                            onClick={() => {
                              void handleRemixFromNode(node);
                            }}
                            disabled={remixingStoryId === node.id}
                          >
                            {remixingStoryId === node.id ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Branch
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#43c0ff]" />
                          {node.remixCount} child branch
                          {node.remixCount === 1 ? "" : "es"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
