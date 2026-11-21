from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.tasks.build_feedback import BuildFeedbackTask
    from core.tasks.detect_holds import DetectHoldsTask
    from core.tasks.find_episodes import FindEpisodesTask
    from core.tasks.infer_route import InferRouteTask
    from core.tasks.match_contacts import MatchContactsTask
    from core.tasks.prepare_video import PrepareVideoTask
    from core.tasks.segment_holds import SegmentHoldsTask
    from core.tasks.stage_task import StageTask
    from core.tasks.track_pose import TrackPoseTask


@dataclass
class TasksManager:
    prepare_video: "PrepareVideoTask" = None
    detect_holds: "DetectHoldsTask" = None
    segment_holds: "SegmentHoldsTask" = None
    track_pose: "TrackPoseTask" = None
    match_contacts: "MatchContactsTask" = None
    infer_route: "InferRouteTask" = None
    find_episodes: "FindEpisodesTask" = None
    build_feedback: "BuildFeedbackTask" = None

    @property
    def stages(self) -> list["StageTask"]:
        return [self.prepare_video, self.detect_holds, self.segment_holds, self.track_pose,
                self.match_contacts, self.infer_route, self.find_episodes, self.build_feedback]
