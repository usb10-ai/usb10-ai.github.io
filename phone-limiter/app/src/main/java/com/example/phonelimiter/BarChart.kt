package com.example.phonelimiter

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

/** Minimal 7-day bar chart; the last bar (today) is highlighted. */
class BarChart(c: Context) : View(c) {
    var values: List<Long> = emptyList(); set(v) { field = v; invalidate() }
    var labels: List<String> = emptyList(); set(v) { field = v; invalidate() }

    private val d = c.resources.displayMetrics.density
    private val bar = Paint(Paint.ANTI_ALIAS_FLAG)
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Ui.MUTED; textSize = 11 * d; textAlign = Paint.Align.CENTER }

    override fun onDraw(cv: Canvas) {
        if (values.isEmpty()) return
        val max = values.maxOrNull()!!.coerceAtLeast(60_000L)
        val slot = width / values.size.toFloat()
        val top = 16 * d; val bottom = height - 18 * d
        values.forEachIndexed { i, v ->
            val cx = slot * i + slot / 2
            val h = ((bottom - top) * v / max).coerceAtLeast(2 * d)
            bar.color = if (i == values.lastIndex) Ui.ACCENT else Color.parseColor("#33507A")
            cv.drawRoundRect(RectF(cx - slot * 0.3f, bottom - h, cx + slot * 0.3f, bottom), 4 * d, 4 * d, bar)
            if (v >= 60_000L) cv.drawText(ScreenTime.format(v).replace(" ", ""), cx, bottom - h - 4 * d, text)
            labels.getOrNull(i)?.let { cv.drawText(it, cx, height - 4 * d, text) }
        }
    }
}
