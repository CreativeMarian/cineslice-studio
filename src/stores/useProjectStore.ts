import { create } from 'zustand';
import type {
  Project,
  Episode,
  Character,
  Scene,
  Shot,
  Keyframe,
  NovelChapter,
} from '../types';
import { projectService } from '../services/projectService';
import { characterService, sceneService } from '../services/assetService';
import { shotService } from '../services/shotService';
import { videoService, type ShotKeyframe, type ShotVideoInterval } from '../services/videoService';

interface ProjectState {
  currentProject: Project | null;
  episodes: Episode[];
  characters: Character[];
  scenes: Scene[];
  shots: Shot[];
  keyframes: Keyframe[];
  chapters: NovelChapter[];
  selectedChapterIds: string[];
  pipelineStep: 'novel' | 'episodes' | 'script' | 'shots';
  currentEpisodeId: string | null;
  isLoading: boolean;
  error: string | null;
  /** P2-前端1: 按镜头缓存的关键帧/视频（导演台批量加载一次，ShotCard 直接读取，避免每卡 2 请求风暴） */
  keyframesByShot: Record<string, ShotKeyframe[]>;
  videosByShot: Record<string, ShotVideoInterval[]>;
  /** P1-16/P2-前端5: 全自动流水线是否运行中（运行期间禁止手动编辑分镜等写操作） */
  autoRunActive: boolean;

  setCurrentProject: (p: Project | null) => void;
  setCurrentEpisode: (id: string | null) => void;
  loadProjectData: (projectId: string) => Promise<void>;
  loadEpisodes: (projectId: string) => Promise<void>;
  loadCharacters: (episodeId: string) => Promise<void>;
  loadScenes: (episodeId: string) => Promise<void>;
  loadShots: (episodeId: string) => Promise<void>;
  loadAllKeyframes: (episodeId: string) => Promise<void>;
  loadAllVideos: (episodeId: string) => Promise<void>;
  setKeyframesForShot: (shotId: string, keyframes: ShotKeyframe[]) => void;
  setVideosForShot: (shotId: string, videos: ShotVideoInterval[]) => void;
  setAutoRunActive: (active: boolean) => void;
  updateEpisode: (id: string, data: Partial<Episode>) => void;
  addEpisodes: (episodes: Episode[]) => void;
  setEpisodes: (episodes: Episode[]) => void;
  setCharacters: (characters: Character[]) => void;
  setScenes: (scenes: Scene[]) => void;
  setShots: (shots: Shot[]) => void;
  updateShot: (id: string, data: Partial<Shot>) => void;
  setChapters: (chapters: NovelChapter[]) => void;
  setSelectedChapterIds: (ids: string[]) => void;
  toggleChapterId: (id: string) => void;
  setPipelineStep: (step: 'novel' | 'episodes' | 'script' | 'shots') => void;
  updatePipelineStep: (step: 'novel' | 'episodes' | 'script' | 'shots') => Promise<void>;
  clear: () => void;
}

// 过期响应守卫：模块级请求序号。快速切换 A→B 剧集/项目时，旧响应的慢请求不得覆盖新数据
let _loadProjectSeq = 0;
let _loadShotsSeq = 0;
let _loadCharsSeq = 0;
let _loadScenesSeq = 0;

// P2-前端1: 全集关键帧/视频加载的去重 + 剧集切换守卫
// 相同 episodeId 的并发加载只发一次（后续组件从缓存读取）；按剧集维护序号，切换剧集后旧响应丢弃
// 注意：关键帧与视频必须使用各自独立的序号，否则并发加载（Promise.all）会互相使对方响应被误判为过期
const _kfSeqByEpisode = new Map<string, number>();
const _videoSeqByEpisode = new Map<string, number>();
const _keyframeLoads = new Map<string, Promise<void>>();
const _videoLoads = new Map<string, Promise<void>>();

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  episodes: [],
  characters: [],
  scenes: [],
  shots: [],
  keyframes: [],
  chapters: [],
  selectedChapterIds: [],
  pipelineStep: 'novel',
  currentEpisodeId: (() => {
    try {
      return localStorage.getItem('currentEpisodeId');
    } catch {
      return null;
    }
  })(),
  isLoading: false,
  error: null,
  keyframesByShot: {},
  videosByShot: {},
  autoRunActive: false,

  setCurrentProject: (p) => set({ currentProject: p }),
  setCurrentEpisode: (id) => {
    try {
      if (id) {
        localStorage.setItem('currentEpisodeId', id);
      } else {
        localStorage.removeItem('currentEpisodeId');
      }
    } catch {
      // 忽略存储错误
    }
    set({ currentEpisodeId: id });
  },

  loadProjectData: async (projectId) => {
    const reqId = ++_loadProjectSeq;
    set({ isLoading: true, error: null });
    try {
      const [projectRes, episodesRes, chaptersRes] = await Promise.all([
        projectService.get(projectId),
        projectService.getEpisodes(projectId),
        projectService.getChapters(projectId),
      ]);
      // 响应到达前若已发起更新的加载（切换项目），丢弃本次结果
      if (reqId !== _loadProjectSeq) return;
      const project = projectRes.data || null;
      const chapters = chaptersRes.data || [];
      const episodes = episodesRes.data || [];

      // 验证 currentEpisodeId 是否属于当前项目，无效则自动选择第一集
      const state = get();
      let validEpisodeId = state.currentEpisodeId;
      if (validEpisodeId && !episodes.some((e: any) => e.id === validEpisodeId)) {
        // localStorage 中的集数不属于当前项目，清除并选择第一集
        try { localStorage.removeItem('currentEpisodeId'); } catch { /* ignore */ }
        validEpisodeId = episodes.length > 0 ? episodes[0].id : null;
        if (validEpisodeId) {
          try { localStorage.setItem('currentEpisodeId', validEpisodeId); } catch { /* ignore */ }
        }
      } else if (!validEpisodeId && episodes.length > 0) {
        // 没有选择集数，自动选择第一集
        validEpisodeId = episodes[0].id;
        try { localStorage.setItem('currentEpisodeId', validEpisodeId); } catch { /* ignore */ }
      }

      set({
        currentProject: project,
        episodes,
        chapters,
        selectedChapterIds: chapters.map((c) => c.id),
        pipelineStep: (project?.pipeline_step as 'novel' | 'episodes' | 'script' | 'shots') || 'novel',
        currentEpisodeId: validEpisodeId,
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  loadEpisodes: async (projectId) => {
    try {
      const res = await projectService.getEpisodes(projectId);
      set({ episodes: res.data || [] });
    } catch {
      // 静默处理
    }
  },

  loadCharacters: async (episodeId) => {
    const mySeq = ++_loadCharsSeq;
    try {
      const res = await characterService.list(episodeId);
      if (mySeq !== _loadCharsSeq) return; // 过期响应丢弃
      set({ characters: res.data || [] });
    } catch {
      if (mySeq !== _loadCharsSeq) return;
      set({ characters: [] });
    }
  },

  loadScenes: async (episodeId) => {
    const mySeq = ++_loadScenesSeq;
    try {
      const res = await sceneService.list(episodeId);
      if (mySeq !== _loadScenesSeq) return; // 过期响应丢弃
      set({ scenes: res.data || [] });
    } catch {
      if (mySeq !== _loadScenesSeq) return;
      set({ scenes: [] });
    }
  },

  loadShots: async (episodeId) => {
    const mySeq = ++_loadShotsSeq;
    try {
      const res = await shotService.list(episodeId);
      if (mySeq !== _loadShotsSeq) return; // 过期响应丢弃
      set({ shots: res.data || [] });
    } catch {
      if (mySeq !== _loadShotsSeq) return;
      set({ shots: [] });
    }
  },

  // P2-前端1: 一次性加载全集所有镜头的关键帧（分块并发；相同 episodeId 并发去重；剧集切换后旧响应丢弃）
  loadAllKeyframes: async (episodeId) => {
    const inFlight = _keyframeLoads.get(episodeId);
    if (inFlight) return inFlight;
    const mySeq = (_kfSeqByEpisode.get(episodeId) || 0) + 1;
    _kfSeqByEpisode.set(episodeId, mySeq);
    const p = (async () => {
      try {
        const shotIds = get().shots.filter((s) => s.episode_id === episodeId).map((s) => s.id);
        const merged: Record<string, ShotKeyframe[]> = {};
        const CHUNK = 8; // 分批并发，避免一次性 N 个请求压垮后端
        for (let i = 0; i < shotIds.length; i += CHUNK) {
          const chunk = shotIds.slice(i, i + CHUNK);
          const results: Array<[string, ShotKeyframe[]]> = await Promise.all(
            chunk.map(async (shotId): Promise<[string, ShotKeyframe[]]> => {
              try {
                const res = await videoService.getKeyframes(shotId);
                return [shotId, res.data || []];
              } catch {
                return [shotId, []]; // 单镜失败静默，不影响其余镜头
              }
            })
          );
          if (_kfSeqByEpisode.get(episodeId) !== mySeq) return; // 已切换剧集，丢弃
          for (const [shotId, kfs] of results) merged[shotId] = kfs;
        }
        if (_kfSeqByEpisode.get(episodeId) !== mySeq) return;
        set((state) => ({
          keyframesByShot: { ...state.keyframesByShot, ...merged },
        }));
      } finally {
        _keyframeLoads.delete(episodeId);
      }
    })();
    _keyframeLoads.set(episodeId, p);
    return p;
  },

  // P2-前端1: 一次性加载全集所有镜头的视频列表（分块并发；相同 episodeId 并发去重；剧集切换后旧响应丢弃）
  loadAllVideos: async (episodeId) => {
    const inFlight = _videoLoads.get(episodeId);
    if (inFlight) return inFlight;
    const mySeq = (_videoSeqByEpisode.get(episodeId) || 0) + 1;
    _videoSeqByEpisode.set(episodeId, mySeq);
    const p = (async () => {
      try {
        const shotIds = get().shots.filter((s) => s.episode_id === episodeId).map((s) => s.id);
        const merged: Record<string, ShotVideoInterval[]> = {};
        const CHUNK = 8;
        for (let i = 0; i < shotIds.length; i += CHUNK) {
          const chunk = shotIds.slice(i, i + CHUNK);
          const results: Array<[string, ShotVideoInterval[]]> = await Promise.all(
            chunk.map(async (shotId): Promise<[string, ShotVideoInterval[]]> => {
              try {
                const res = await videoService.listByShot(shotId);
                return [shotId, res.data || []];
              } catch {
                return [shotId, []]; // 单镜失败静默，不影响其余镜头
              }
            })
          );
          if (_videoSeqByEpisode.get(episodeId) !== mySeq) return; // 已切换剧集，丢弃
          for (const [shotId, videos] of results) merged[shotId] = videos;
        }
        if (_videoSeqByEpisode.get(episodeId) !== mySeq) return;
        set((state) => ({
          videosByShot: { ...state.videosByShot, ...merged },
        }));
      } finally {
        _videoLoads.delete(episodeId);
      }
    })();
    _videoLoads.set(episodeId, p);
    return p;
  },

  setKeyframesForShot: (shotId, keyframes) =>
    set((state) => ({ keyframesByShot: { ...state.keyframesByShot, [shotId]: keyframes } })),

  setVideosForShot: (shotId, videos) =>
    set((state) => ({ videosByShot: { ...state.videosByShot, [shotId]: videos } })),

  setAutoRunActive: (active) => set({ autoRunActive: active }),

  updateEpisode: (id, data) =>
    set((state) => ({
      episodes: state.episodes.map((ep) =>
        ep.id === id ? { ...ep, ...data } : ep
      ),
    })),

  addEpisodes: (episodes) =>
    set((state) => ({ episodes: [...state.episodes, ...episodes] })),

  setEpisodes: (episodes) => set({ episodes }),

  setCharacters: (characters) => set({ characters }),
  setScenes: (scenes) => set({ scenes }),
  setShots: (shots) => set({ shots }),

  updateShot: (id, data) =>
    set((state) => ({
      shots: state.shots.map((s) => (s.id === id ? { ...s, ...data } : s)),
    })),

  setChapters: (chapters) => set({ chapters }),

  setSelectedChapterIds: (ids) => set({ selectedChapterIds: ids }),

  toggleChapterId: (id) =>
    set((state) => {
      const exists = state.selectedChapterIds.includes(id);
      return {
        selectedChapterIds: exists
          ? state.selectedChapterIds.filter((x) => x !== id)
          : [...state.selectedChapterIds, id],
      };
    }),

  setPipelineStep: (step) => set({ pipelineStep: step }),

  updatePipelineStep: async (step: 'novel' | 'episodes' | 'script' | 'shots') => {
    const { currentProject } = get();
    set({ pipelineStep: step });
    if (currentProject) {
      try {
        await projectService.update(currentProject.id, { pipeline_step: step });
      } catch {
        // 静默处理，本地状态已更新
      }
    }
  },

  clear: () =>
    set({
      currentProject: null,
      episodes: [],
      characters: [],
      scenes: [],
      shots: [],
      keyframes: [],
      chapters: [],
      selectedChapterIds: [],
      pipelineStep: 'novel',
      currentEpisodeId: null,
      error: null,
      keyframesByShot: {},
      videosByShot: {},
      autoRunActive: false,
    }),
}));
