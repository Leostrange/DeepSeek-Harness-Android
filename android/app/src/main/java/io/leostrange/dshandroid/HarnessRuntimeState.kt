package io.leostrange.dshandroid

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class HarnessStage {
    IDLE,
    BOOTSTRAPPING,
    VERIFYING,
    INSTALLING_HARNESS,
    STARTING,
    RUNNING,
    STOPPED,
    ERROR,
}

/** How the current run was started; drives which recovery actions are shown. */
enum class HarnessStartMode { NORMAL, REINSTALL, FULL_RESET }

data class HarnessSnapshot(
    val stage: HarnessStage = HarnessStage.IDLE,
    val message: String = "Ожидание запуска",
    val progressCurrent: Int = 0,
    val progressTotal: Int = 0,
    val logTail: String = "",
    val error: String? = null,
    val startMode: HarnessStartMode = HarnessStartMode.NORMAL,
    val fullResetConfirmed: Boolean = false,
    /** Tokenized DSH web URL printed by `dsh web`; required for WebView auth. */
    val harnessUrl: String? = null,
) {
    val ready: Boolean get() = stage == HarnessStage.RUNNING
    val progress: Float?
        get() = if (progressTotal > 0) (progressCurrent.toFloat() / progressTotal.toFloat()).coerceIn(0f, 1f) else null
}

object HarnessRuntimeState {
    private val mutable = MutableStateFlow(HarnessSnapshot())
    val state: StateFlow<HarnessSnapshot> = mutable.asStateFlow()

    fun set(snapshot: HarnessSnapshot) {
        mutable.value = snapshot
    }

    fun update(transform: (HarnessSnapshot) -> HarnessSnapshot) {
        mutable.value = transform(mutable.value)
    }
}
