import json
import logging

from database.enums import Stage
from core.tasks.settings import BuildFeedbackTaskSettings
from core.tasks.stage_task import StageRun, StageTask
from database.schemas import Task
from service.feedback import build_feedback
from service.llm import LLMError

logger = logging.getLogger(__name__)


class BuildFeedbackTask(StageTask):
    """Asks the model for advice on the observed episodes and publishes the analysis of the video."""

    stage = Stage.BUILD_FEEDBACK
    inputs = (Stage.FIND_EPISODES,)

    @property
    def _settings(self) -> BuildFeedbackTaskSettings:
        return self._context.settings.build_feedback_task

    async def _compute(self, run: StageRun) -> None:
        timeline = json.loads(run.inputs[Stage.FIND_EPISODES].read_bytes())
        feedback = await build_feedback(timeline, run.task.profile_snapshot, self._context.llm)
        run.output.write_text(json.dumps(feedback, ensure_ascii=False))

    async def _finish(self, run: StageRun) -> bool:
        return await self._context.db_manager.finish_build_feedback(
            run.task, self._result_key(run.task), json.loads(run.output.read_text()))

    async def _handle_error(self, task: Task, error: Exception) -> None:
        if isinstance(error, LLMError):
            logger.warning("stage=%s video=%s error=%s", task.type, task.video_id, error)
            await self._context.db_manager.fail(task, "Не удалось получить разбор от модели.",
                                                retryable=error.retryable)
            return
        await super()._handle_error(task, error)
