package com.example.phonelimiter

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*

/** Tiny UI helpers so the screens share one dark, rounded look. */
object Ui {
    val BG = Color.parseColor("#0F1724")
    val CARD = Color.parseColor("#1A2536")
    val ACCENT = Color.parseColor("#4F9DFF")
    val MUTED = Color.parseColor("#9AA8BC")

    fun dp(c: Context, v: Int) = (v * c.resources.displayMetrics.density).toInt()

    fun rounded(color: Int, radius: Float, c: Context) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(c, radius.toInt()).toFloat()
    }

    fun text(c: Context, s: String, size: Float, color: Int = Color.WHITE, bold: Boolean = false) =
        TextView(c).apply {
            text = s; textSize = size; setTextColor(color)
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        }

    fun card(c: Context) = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        background = rounded(CARD, 18f, c)
        setPadding(dp(c, 18), dp(c, 16), dp(c, 18), dp(c, 16))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(c, 14) }
    }

    fun button(c: Context, label: String, fill: Int = ACCENT, fg: Int = Color.WHITE) = Button(c).apply {
        text = label; isAllCaps = false; textSize = 16f; setTextColor(fg)
        background = rounded(fill, 14f, c)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(c, 52))
            .apply { topMargin = dp(c, 12) }
    }

    fun number(c: Context, v: Int) = EditText(c).apply {
        setText(v.toString()); inputType = 2; textSize = 18f; setTextColor(Color.WHITE)
        gravity = Gravity.CENTER; background = rounded(Color.parseColor("#263449"), 10f, c)
        layoutParams = LinearLayout.LayoutParams(dp(c, 72), dp(c, 46))
    }

    /** "Label ........ [number]" row. */
    fun row(c: Context, label: String, field: EditText) = LinearLayout(c).apply {
        gravity = Gravity.CENTER_VERTICAL
        setPadding(0, dp(c, 8), 0, dp(c, 8))
        addView(text(c, label, 15f).apply { layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f) })
        addView(field)
    }
}
