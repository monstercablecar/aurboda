package net.aurboda

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import java.util.UUID

class ActivityWatchWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    return try {
    if (!isActivityWatchSyncEnabled(applicationContext)) return Result.success()
    val scope = activityWatchScope(applicationContext) ?: return Result.success()
    val requestedScope = inputData.getString("scope")
    if (requestedScope != null && requestedScope != scope) return Result.success()
    val credentials = CredentialsManager.getCredentials(applicationContext) ?: return Result.success()
    val client = syncHttpClient(onTokenRefused = { forgetRefusedToken(applicationContext, it) })
    try {
      val result = processActivityWatchSync(credentials.apiUrl, credentials.authToken, client, applicationContext)
      if (result.retryable && (result.error != null || result.progress.contains("paused"))) Result.retry() else Result.success()
    } finally { client.close() }
  } catch (cancelled: CancellationException) {
    throw cancelled
  } catch (_: Exception) {
    Result.retry()
  }
  }
  companion object {
    private val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    fun schedule(context: Context) {
      WorkManager.getInstance(context).enqueueUniquePeriodicWork("activitywatch_periodic", ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<ActivityWatchWorker>(15, TimeUnit.MINUTES).setConstraints(constraints)
          .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
    }
    fun enqueue(context: Context, backfill: Boolean = false) {
      val scope = activityWatchScope(context) ?: return
      if (backfill) check(context.getSharedPreferences("ActivityWatchSyncV2", Context.MODE_PRIVATE).edit().putString("$scope.backfill_requested", UUID.randomUUID().toString()).commit())
      WorkManager.getInstance(context).enqueueUniqueWork("activitywatch_now_$scope", if (backfill) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP,
        OneTimeWorkRequestBuilder<ActivityWatchWorker>().setConstraints(constraints).setInputData(workDataOf("scope" to scope))
          .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
    }
    fun cancel(context: Context) {
      WorkManager.getInstance(context).cancelUniqueWork("activitywatch_now_${activityWatchScope(context)}")
      WorkManager.getInstance(context).cancelUniqueWork("activitywatch_periodic")
    }
  }
}
