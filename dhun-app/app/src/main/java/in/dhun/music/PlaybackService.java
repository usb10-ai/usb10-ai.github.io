package in.dhun.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps Dhun running while music plays with the screen off or another app open,
 * and shows a notification with previous / play-pause / next buttons.
 */
public class PlaybackService extends Service {
    static final String ACTION_STATE = "in.dhun.music.STATE";
    static final String ACTION_CMD = "in.dhun.music.CMD";
    private static final String CHANNEL = "playback";
    private static final int ID = 1;
    static volatile boolean running = false;

    private PowerManager.WakeLock lock;
    private boolean playing = false;
    private String title = "", artist = "";

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dhun:playback");
        lock.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CMD.equals(intent.getAction())) {
            MainActivity.command(intent.getStringExtra("cmd"));
        } else if (intent != null && ACTION_STATE.equals(intent.getAction())) {
            playing = intent.getBooleanExtra("playing", false);
            String t = intent.getStringExtra("title"), a = intent.getStringExtra("artist");
            if (t != null && !t.isEmpty()) title = t;
            if (a != null) artist = a;
        }
        Notification n = build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID, n);
        if (playing) lock.acquire(6 * 60 * 60 * 1000L); else if (lock.isHeld()) lock.release();
        return START_NOT_STICKY;
    }

    private PendingIntent cmd(String c, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(ACTION_CMD).putExtra("cmd", c);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification build() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_note)
         .setContentTitle(title.isEmpty() ? "Dhun" : title)
         .setContentText(artist)
         .setContentIntent(content)
         .setOngoing(playing)
         .setShowWhen(false)
         .setVisibility(Notification.VISIBILITY_PUBLIC)
         .addAction(new Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_media_previous), "Previous", cmd("prev", 1)).build())
         .addAction(new Notification.Action.Builder(Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play), playing ? "Pause" : "Play", cmd("toggle", 2)).build())
         .addAction(new Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_media_next), "Next", cmd("next", 3)).build())
         .setStyle(new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (lock != null && lock.isHeld()) lock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
