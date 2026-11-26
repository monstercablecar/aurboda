package net.aurboda

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun ActivityWatchSection(context: Context, enabled: Boolean, onEnabled: (Boolean) -> Unit) {
  var status by remember { mutableStateOf(loadActivityWatchStatus(context)) }
  var key by remember { mutableStateOf("") }
  var keySaved by remember { mutableStateOf(false) }
  DisposableEffect(context) {
    val prefs = context.getSharedPreferences("ActivityWatchSyncV2", Context.MODE_PRIVATE)
    val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> status = loadActivityWatchStatus(context) }
    prefs.registerOnSharedPreferenceChangeListener(listener)
    onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
  }
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text("ActivityWatch", style = MaterialTheme.typography.titleMedium)
      Text("Import app usage and all available history from ActivityWatch on this phone.")
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("ActivityWatch Sync")
        Switch(checked = enabled, onCheckedChange = onEnabled)
      }
      Text(when {
        !enabled -> "Synchronization disabled for this Aurboda account"
        status.error != null -> "Needs attention"
        status.lastSuccess != null && status.eventsPushed > 0 -> "Activity events confirmed by Aurboda"
        status.available -> "ActivityWatch reachable; no confirmed import yet"
        else -> "Connection not verified"
      })
      OutlinedTextField(value = key, onValueChange = { key = it; keySaved = false }, label = { Text("ActivityWatch API key") },
        visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
      Text("In ActivityWatch, open Settings → API authentication and copy its key. This is separate from your Aurboda sign-in. Leave authentication enabled.", style = MaterialTheme.typography.bodySmall)
      Button(onClick = { ActivityWatchKeyStore.save(context, key); key = ""; keySaved = true }) { Text("Save API key") }
      if (keySaved) Text("Key saved securely on this phone.")
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(enabled = enabled, onClick = { ActivityWatchWorker.enqueue(context) }) { Text("Sync Now") }
        OutlinedButton(enabled = enabled, onClick = { ActivityWatchWorker.enqueue(context) }) { Text("Retry") }
      }
      OutlinedButton(enabled = enabled, onClick = { ActivityWatchWorker.enqueue(context, backfill = true) }) { Text("Import all history again") }
      Text("Last successful sync: ${status.lastSuccess ?: "Never"}")
      Text("Last attempted sync: ${status.lastAttempt ?: "Never"}")
      Text("Confirmed events across source devices: ${status.eventsPushed}")
      Text("Earliest imported: ${status.earliest ?: "None"}")
      Text("Latest imported: ${status.latest ?: "None"}")
      Text("Historical backfill: ${status.progress}")
      Text("Connection diagnostics: 127.0.0.1:5600 • ${status.bucketsFound} app-usage buckets found", style = MaterialTheme.typography.bodySmall)
      status.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
      Text("If unavailable, open ActivityWatch and verify that it shows app usage. Allow background battery use for both apps. Sync Now checks the local API, key, buckets and server acknowledgment. Your original ActivityWatch data is never changed.", style = MaterialTheme.typography.bodySmall)
    }
  }
}
