from database.enums import Stage
from core.tasks.interval_task import IntervalTaskSettings


class StageTaskSettings(IntervalTaskSettings):
    period: float = 1  # [sec] pause after the queue has nothing ready for this stage


class VideoStageTaskSettings(StageTaskSettings):
    timeout: float = 600  # [sec] limit for one run of the isolated video process


class PrepareVideoTaskSettings(VideoStageTaskSettings):
    name: str = Stage.PREPARE_VIDEO


class DetectHoldsTaskSettings(VideoStageTaskSettings):
    name: str = Stage.DETECT_HOLDS


class SegmentHoldsTaskSettings(VideoStageTaskSettings):
    name: str = Stage.SEGMENT_HOLDS


class TrackPoseTaskSettings(VideoStageTaskSettings):
    name: str = Stage.TRACK_POSE


class MatchContactsTaskSettings(VideoStageTaskSettings):
    name: str = Stage.MATCH_CONTACTS


class InferRouteTaskSettings(VideoStageTaskSettings):
    name: str = Stage.INFER_ROUTE


class FindEpisodesTaskSettings(VideoStageTaskSettings):
    name: str = Stage.FIND_EPISODES


class BuildFeedbackTaskSettings(StageTaskSettings):
    name: str = Stage.BUILD_FEEDBACK
