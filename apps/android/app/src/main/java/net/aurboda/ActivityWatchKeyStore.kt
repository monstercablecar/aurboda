package net.aurboda

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object ActivityWatchKeyStore {
  private fun prefs(context: Context) = EncryptedSharedPreferences.create(context, "ActivityWatchSecurePrefs",
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
  fun get(context: Context): String = prefs(context).getString("api_key", "") ?: ""
  fun save(context: Context, key: String) { prefs(context).edit().putString("api_key", key.trim()).apply() }
}
