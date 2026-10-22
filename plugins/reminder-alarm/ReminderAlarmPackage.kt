package __PACKAGE__

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import expo.modules.notifications.service.NotificationsService

class ReminderAlarmPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(ReminderAlarmModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class ReminderAlarmModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ReminderAlarm"

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = if (Build.VERSION.SDK_INT >= 26) manager.getNotificationChannel("study-reminders") else null
      val result = Arguments.createMap()
      result.putBoolean("exact", Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms())
      result.putBoolean("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled())
      result.putBoolean("channelEnabled", channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE)
      promise.resolve(result)
    } catch (error: Exception) { promise.reject("REMINDER_STATUS", "알림 권한 상태를 확인할 수 없습니다", error) }
  }

  @ReactMethod
  fun openExactSettings(promise: Promise) {
    try {
      val intent = if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
        else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) { promise.reject("REMINDER_SETTINGS", "알림 설정을 열 수 없습니다", error) }
  }
}

/** Reuse Expo's persisted schedules on timezone/time changes and exact-alarm grants. */
class ReminderClockReceiver : NotificationsService() {
  override fun handleIntent(context: Context, intent: Intent) {
    super.handleIntent(context, Intent(intent).setAction(Intent.ACTION_BOOT_COMPLETED))
  }
}
