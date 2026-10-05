package com.deepseekharness.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import androidx.appcompat.app.AppCompatActivity;
import com.deepseekharness.app.core.ConfigStore;
import com.deepseekharness.app.util.Constants;

/** Explicit first-run choice before installation or workspace startup. */
public final class LanguageOnboardingActivity extends AppCompatActivity {
    private String selectedLanguage="ru";
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        CardPage page = new CardPage(this,"Выберите язык\nChoose your language","DSHA · DeepSeek Harness");
        String[] values={"ru","en","zh","system"};
        String[] labels={"Русский","English","简体中文","Как в системе / System"};
        RadioGroup choices=new RadioGroup(this);page.card().addView(choices);
        int[] ids=new int[values.length];
        for(int i=0;i<values.length;i++) {
            RadioButton option=new RadioButton(this);ids[i]=android.view.View.generateViewId();
            option.setId(ids[i]);option.setText(labels[i]);option.setTextSize(18);option.setMinHeight(page.dp(64));
            option.setPadding(page.dp(12),page.dp(8),page.dp(12),page.dp(8));choices.addView(option);
        }
        String stored=saved==null?new ConfigStore(this).getUiLanguagePreference():saved.getString("selection","ru");
        int selected=java.util.Arrays.asList(values).indexOf(stored);
        int initial=selected<0 || saved==null&&"system".equals(stored)?0:selected;
        selectedLanguage=values[initial];choices.check(ids[initial]);
        choices.setOnCheckedChangeListener((group,id)->{for(int i=0;i<ids.length;i++)if(ids[i]==id)selectedLanguage=values[i];});
        page.button(page.footer,"Продолжить / Continue",true,()->{
            int index=0;for(int i=0;i<ids.length;i++)if(choices.getCheckedRadioButtonId()==ids[i])index=i;
            String language=values[index];
            if(!getSharedPreferences(Constants.PREFS,MODE_PRIVATE).edit().putString("ui_language",language)
                    .putBoolean("language_onboarding_complete",true).commit()) {
                android.widget.Toast.makeText(this,"Не удалось сохранить язык / Could not save language",android.widget.Toast.LENGTH_LONG).show();return;
            }
            LanguageController.apply(this);startActivity(new Intent(this,MainActivity.class));finish();
        });
        setContentView(page.root);
    }
    @Override protected void onSaveInstanceState(Bundle state){state.putString("selection",selectedLanguage);super.onSaveInstanceState(state);}
}
