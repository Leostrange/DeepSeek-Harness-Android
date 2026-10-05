package com.deepseekharness.app.util;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 仅在应用状态的显示边界重译。匹配完整文案或登记的完整模板，参数保持原文。 */
public final class UiStateText {
    private UiStateText() { }
    private static final Map<String,String> ZH=new LinkedHashMap<>();
    private static final Pattern[][] FORMATS=new Pattern[UiMessages.FORMATS.length][3];
    static {
        UiMessages.EN.forEach((zh,en)->ZH.putIfAbsent(en,zh));
        UiMessages.RU.forEach((zh,ru)->ZH.putIfAbsent(ru,zh));
        for(int i=0;i<FORMATS.length;i++)for(int lang=0;lang<3;lang++) {
            String[] parts=UiMessages.FORMATS[i][lang].split("%s",-1);
            StringBuilder regex=new StringBuilder("\\A");
            for(int j=0;j<parts.length;j++) {
                if(j>0)regex.append("(.*?)");
                regex.append(Pattern.quote(parts[j]));
            }
            FORMATS[i][lang]=Pattern.compile(regex.append("\\z").toString(),Pattern.DOTALL);
        }
    }
    public static String render(String value) {
        if(value==null)return "";
        boolean russian="ru".equals(UiText.language());
        boolean english=!"zh".equals(UiText.language());
        String original=ZH.getOrDefault(value,value);
        if(UiMessages.EN.containsKey(original)||UiMessages.RU.containsKey(original)) {
            if(russian)return UiMessages.RU.getOrDefault(original,UiMessages.EN.getOrDefault(original,original));
            return english?UiMessages.EN.getOrDefault(original,original):original;
        }
        for(int i=0;i<FORMATS.length;i++)for(int source=0;source<3;source++) {
            Matcher match=FORMATS[i][source].matcher(value);
            if(!match.matches())continue;
            String template=UiMessages.FORMATS[i][russian?2:english?1:0];
            String[] parts=template.split("%s",-1);
            StringBuilder result=new StringBuilder(parts[0]);
            for(int j=1;j<parts.length;j++)result.append(match.group(j)).append(parts[j]);
            return result.toString();
        }
        return value;
    }
}
