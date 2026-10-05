package com.deepseekharness.app.util;

import java.util.LinkedHashMap;
import java.util.Map;

/** 仅在应用状态的显示边界重译。匹配完整文案或登记的完整模板，参数保持原文。 */
public final class UiStateText {
  private UiStateText() {}

  private static final Map<String, String> ZH = new LinkedHashMap<>();
  private static final UiMessageFormat[][] FORMATS =
      new UiMessageFormat[UiMessages.FORMATS.length][3];

  static {
    UiMessages.EN.forEach((zh, en) -> ZH.putIfAbsent(en, zh));
    UiMessages.RU.forEach((zh, ru) -> ZH.putIfAbsent(ru, zh));
    for (int i = 0; i < FORMATS.length; i++)
      for (int lang = 0; lang < 3; lang++)
        FORMATS[i][lang] = new UiMessageFormat(UiMessages.FORMATS[i][lang]);
  }

  public static String render(String value) {
    if (value == null) return "";
    boolean russian = "ru".equals(UiText.language());
    boolean english = "en".equals(UiText.language());
    String task = BackupTaskKinds.display(value, english);
    if (task != null) return russian ? UiText.text(task) : task;
    if (russian) {
      String original = ZH.getOrDefault(value, value);
      String translated = UiMessages.RU.get(original);
      if (translated != null) return translated;
      if (UiMessages.EN.containsKey(original)) return UiMessages.EN.get(original);
    }
    String direct = (russian ? UiMessages.RU : english ? UiMessages.EN : ZH).get(value);
    if (direct != null) return direct;
    // 已翻译的同语言完整文案无需继续套模板。
    if ((english ? ZH : UiMessages.EN).containsKey(value)) return value;
    String chosen = null;
    int literalLength = -1, arguments = Integer.MAX_VALUE;
    for (int i = 0; i < FORMATS.length; i++)
      for (int source = 0; source < 3; source++) {
        String result = FORMATS[i][source].reformat(value, FORMATS[i][russian ? 2 : english ? 1 : 0]);
        if (result == null) continue;
        UiMessageFormat matched = FORMATS[i][source];
        // 按实际匹配语言的固定文本排序，不能让更长的英文译句抢走具体中文状态；
        // 固定文本相同则优先参数更少的完整模板，防止空的首参数吞掉另一种状态。
        if (matched.literalLength() > literalLength
            || matched.literalLength() == literalLength && matched.argumentCount() < arguments) {
          chosen = result;
          literalLength = matched.literalLength();
          arguments = matched.argumentCount();
        }
      }
    return chosen == null ? value : chosen;
  }
}
