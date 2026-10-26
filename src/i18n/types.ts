import type { AudioTranscriptionErrorCode } from '../types'

export type AppLocale = 'en' | 'vi' | 'ja'

/** Locale key paired one-to-one with the stable audio transcription error contract. */
export type VoiceErrorTranslationKey = `voice_error_${Lowercase<AudioTranscriptionErrorCode>}`

export interface Translations {
  session_restoring: string
  session_smart_reset: string
  session_smart_reset_desc: string
  session_translate_fresh: string
  session_dictionary_fresh: string
  session_restore_previous: string
  session_save_failed: string
  session_retry_save: string
  session_recovery_unavailable: string
  session_history_limits: string
  // Navbar / Sidebar
  nav_translate: string
  nav_settings: string
  nav_new_chat: string
  nav_chat: string
  nav_dictionary: string
  nav_thermal: string
  nav_command_palette: string
  nav_primary_sidebar: string
  /** System pages (always present, not modules). */
  nav_home: string
  settings_search_placeholder: string
  settings_search_clear: string
  settings_search_empty: string
  nav_everywhere: string
  nav_utilities: string
  command_palette_home_description: string
  command_palette_everywhere_description: string
  command_palette_utilities_description: string
  /** Home, Translate everywhere, Launcher & shortcuts pages. */
  home_subtitle: string
  home_new_chat: string
  home_quick_start: string
  home_resume_title: string
  home_resume_description: string
  home_resume_empty: string
  home_resume_action: string
  home_kind_chat: string
  home_kind_research: string
  home_kind_translate: string
  home_kind_live: string
  home_kind_dictionary: string
  home_live_with_summary: string
  home_live_untitled: string
  home_open: string
  home_edit: string
  home_system_title: string
  home_system_warm: string
  home_system_hot: string
  home_system_load: string
  home_system_loading: string
  home_system_unavailable: string
  home_system_profile: string
  home_system_profile_custom: string
  home_ai_title: string
  home_ai_ready: string
  home_ai_missing_key: string
  home_ai_local: string
  home_ai_manage: string
  home_shortcuts_title: string
  everywhere_subtitle: string
  utilities_subtitle: string
  utilities_title: string
  everywhere_steps_label: string
  everywhere_step_select: string
  everywhere_step_select_desc: string
  everywhere_step_press: string
  everywhere_step_press_desc: string
  everywhere_step_replace: string
  everywhere_step_replace_desc: string
  everywhere_language_pair: string
  everywhere_model: string
  everywhere_model_desc: string
  everywhere_permission_granted: string
  everywhere_permission_missing: string
  everywhere_ext_title: string
  everywhere_ext_desc: string
  everywhere_ext_has_token: string
  everywhere_ext_no_token: string
  everywhere_ext_steps_label: string
  everywhere_ext_step_download: string
  everywhere_ext_step_load: string
  everywhere_ext_step_load_desc: string
  everywhere_ext_step_token: string
  everywhere_ext_tokens: string
  everywhere_ext_server: string
  everywhere_ext_server_desc: string
  shortcuts_all_title: string
  shortcuts_all_description: string
  shortcut_launcher: string
  shortcut_quick_translate: string
  shortcut_command_palette: string
  shortcut_new_chat: string
  shortcut_send_message: string
  shortcut_scope_global: string
  shortcut_scope_window: string
  shortcut_scope_composer: string
  shortcut_conflict: string
  shortcut_unset: string
  shortcut_off: string
  /** Primary sidebar group headings. */
  nav_space_ai: string
  nav_space_language: string
  nav_space_system: string
  nav_space_tools: string
  /** The command palette trigger at the top of the primary sidebar. */
  nav_search_or_run: string
  nav_search_label: string
  /** Accessible name of the toast stack. */
  notifications_region: string
  /** Background activity strip at the bottom of the primary sidebar. */
  nav_background_title: string
  /** `{profile}` is the active fan profile's name. */
  nav_background_fans_profile: string
  nav_background_fans_custom: string
  nav_background_hotkeys: string
  nav_background_browser: string
  nav_background_ready: string
  /** Collapsed-rail summary dot; `{count}` is the number of running items. */
  nav_background_summary: string
  route_loading: (feature: string) => string
  command_palette_search_placeholder: string
  command_palette_no_results: string
  command_palette_hint_navigate: string
  command_palette_hint_open: string
  command_palette_hint_close: string
  command_palette_chat_description: string
  command_palette_translate_description: string
  command_palette_live_description: string
  command_palette_dictionary_description: string
  command_palette_thermal_description: string
  command_palette_settings_description: string
  /** `{expression}` is what the user typed, e.g. "25 + 25". */
  command_palette_calc_description: string
  command_palette_ask_ai_label: string
  /** `{query}` is the text the user typed. */
  command_palette_ask_ai_description: string
  command_palette_hint_back: string
  command_palette_answer_disclaimer: string
  command_palette_verify_label: string
  /** `{query}` is the text the user typed. */
  command_palette_verify_description: string
  /** `{text}` is the text to translate. */
  command_palette_translate_text_description: string
  /** `{text}` is the word or phrase to look up. */
  command_palette_dictionary_text_description: string
  /** Tooltip / aria-label on the sidebar collapse button */
  nav_collapse_sidebar: string
  /** Tooltip / aria-label on the sidebar expand button */
  nav_expand_sidebar: string

  // Translate page
  translate_placeholder: string
  translate_result_placeholder: string
  translate_btn: string
  translate_btn_loading: string
  translate_clear: string
  translate_copy: string
  translate_copied: string
  translate_auto_indicator: string
  translate_manual_indicator: string
  /** Template: "{count} chars"; the number is pre-formatted for the locale. */
  translate_char_count: string
  translate_long_text_label: string
  translate_long_text_notice: (limit: number) => string
  language_pairs_previous_session: string
  language_pairs_pinned: string
  language_pairs_pin: string
  language_pairs_saved: string
  /** Accessible name of the connected source / target control. */
  language_pairs_label: string
  /** Heading of the recent / pinned pair chips in the language picker. */
  language_pairs_recent: string
  language_pairs_unpin: string
  language_pairs_locked: string
  /** Short lock tooltip while a Live session is running. */
  language_pairs_locked_short: string
  language_pairs_same: string
  translate_use_as_source: string
  translate_swap: string
  translate_error_no_key: string
  translate_error_open_settings: string
  /** Button label to dismiss / close the error banner */
  translate_error_dismiss: string
  /** Button label to retry the last failed translation */
  translate_error_retry: string
  translate_error_choose_model: string
  translate_error_context: (provider: string, model: string) => string
  /** Error shown when rewrite fails */
  translate_error_rewrite: string
  /** Error shown when copy to clipboard fails */
  translate_error_copy: string
  /** Generic fallback when translation fails for an unknown reason */
  translate_error_unexpected: string
  /** Generic fallback when translation IPC returned success=false without a specific message */
  translate_error_generic: string
  /** Provider returned no usable translation */
  translate_error_empty_response: string
  translate_error_output_truncated: string
  translate_error_invalid_response: string
  /** Provider blocked the result because it resembled protected text */
  translate_error_blocked_recitation: string
  /** Provider blocked the translation through its safety filter */
  translate_error_blocked_safety: string
  /** The model itself declined (Claude refusal); already retried once by the main process */
  translate_error_model_refusal: string
  /** Error shown when downloading the translated image fails */
  translate_error_download: string
  translate_phonetic: string
  /** Phonetic mode dropdown — off */
  translate_phonetic_off: string
  /** Phonetic mode dropdown — standard (furigana/romanisation) */
  translate_phonetic_standard: string
  /** Phonetic mode dropdown — full phonetic transcription */
  translate_phonetic_transcription: string
  translate_phonetic_compare_unsupported: string
  translate_style_label: string
  translate_style_general: string
  translate_style_formal: string
  translate_style_casual: string
  translate_style_business: string
  translate_style_technical: string
  translate_style_natural: string
  translate_style_general_desc: string
  translate_style_formal_desc: string
  translate_style_casual_desc: string
  translate_style_business_desc: string
  translate_style_technical_desc: string
  translate_style_natural_desc: string
  translate_reasoning_label: string
  translate_reasoning_auto: string
  translate_reasoning_low: string
  translate_reasoning_medium: string
  translate_reasoning_high: string
  translate_reasoning_unsupported: string
  translate_speak: string
  translate_speak_stop: string
  translate_rewrite: string
  translate_rewriting: string
  /** Tooltip when automatic translation is enabled. */
  translate_mode_auto_title: string
  /** Tooltip when automatic translation is disabled. */
  translate_mode_manual_title: string
  /** Stable label on the automatic translation toggle. */
  translate_mode_auto: string
  /** Static mode label used by multi-model comparison. */
  translate_controls_label: string
  translate_options: string
  translate_settings_scope: string
  translate_settings_reset: string
  ai_configuration_title: string
  ai_configuration_chat_scope: string
  ai_configuration_new_chat_scope: string
  ai_configuration_translate_scope: string
  ai_configuration_interpret_scope: string
  ai_configuration_dictionary_scope: string
  ai_configuration_interpret_active_scope: string
  ai_configuration_models_section: string
  ai_configuration_translation_section: string
  ai_configuration_transcription_section: string
  ai_configuration_output_section: string
  translate_add_image: string
  translate_from_label: string
  translate_to_label: string
  language_picker_search_placeholder: string
  language_picker_no_results: string
  language_picker_more: string
  translate_source_content_label: string
  translate_result_content_label: string
  translate_detecting_language: string
  translate_detected_language: (language: string) => string
  translate_swap_disabled_auto: string
  translate_input_help: string
  translate_input_mode_label: string
  translate_input_mode_text: string
  translate_input_mode_image: string
  translate_input_mode_voice: string
  translate_compare_models: string
  translate_image_drop_title: string
  translate_image_drop_hint: string
  translate_image_choose: string
  translate_image_change: string
  translate_voice_hint: string
  translate_manual_shortcut: string
  /** Toast after a single history entry is deleted; offers an undo action. */
  translate_history_deleted: string
  translate_history_deleted_undo: string
  translate_empty_auto_hint: string
  translate_empty_manual_hint: string
  translate_result_stale_auto: string
  translate_result_stale_manual: string
  translate_result_ready: string
  translate_models_trigger: (count: number) => string
  translate_models_trigger_label: (count: number) => string
  translate_models_title: string
  translate_models_close: string
  translate_models_description: string
  translate_models_selected: string
  translate_models_available: string
  translate_models_remove: string
  translate_models_none_selected: string
  translate_models_replace_notice: string
  translate_models_select: string
  translate_models_selected_state: string
  translate_models_result_position: (position: number) => string
  translate_models_needs_key: string
  translate_models_limit_reached: string
  translate_models_manual_notice: string
  translate_models_cancel: string
  translate_models_apply: (count: number) => string
  translate_compare_progress: (completed: number, total: number) => string
  translate_compare_mobile_tabs: string
  translate_compare_idle: string
  translate_compare_idle_short: string
  translate_compare_status_ready: string
  translate_compare_status_running: string
  translate_compare_status_complete: string
  translate_compare_status_failed: string
  translate_compare_error_missing_key: (provider: string) => string
  translate_compare_error_invalid_key: (provider: string) => string
  translate_compare_error_rate_limit: (provider: string) => string
  translate_compare_error_model_unavailable: (model: string, provider: string) => string
  translate_compare_error_network: (provider: string) => string
  translate_compare_error_unknown: (model: string) => string
  translate_compare_change_model: string
  translate_compare_retry: string
  translate_compare_duration: (seconds: string) => string
  translate_compare_submit: (count: number) => string
  translate_compare_submitting: (count: number) => string
  translate_compare_heading: (count: number) => string
  translate_compare_highlight: string
  translate_compare_highlight_hint: string
  translate_compare_failures_label: string
  translate_compare_dismiss_failure: string
  translate_compare_pick: string
  translate_compare_picked: string
  translate_compare_pick_short: string
  translate_history_title: string
  translate_history_toggle_show: string
  translate_history_toggle_hide: string
  translate_history_close: string
  translate_history_empty: string
  translate_history_clear: string
  translate_history_clear_confirm: string
  translate_compare_identical: string
  translate_compare_source_expand: string
  translate_compare_source_collapse: string
  translate_compare_view_label: string
  translate_compare_view_columns: string
  translate_compare_view_sentences: string
  translate_compare_sentences_label: string
  translate_compare_sentence_source: string
  translate_compare_sentence_row: (position: number) => string
  translate_compare_sentence_use: string
  translate_compare_sentence_used: string
  translate_compare_sentence_misaligned: (count: number, expected: number) => string
  translate_compare_sentences_unavailable: string
  translate_compare_assembly_label: string
  translate_compare_assembly_single: (model: string) => string
  translate_compare_assembly_mixed: (count: number, model: string) => string

  // Voice recording
  voice_record: string
  voice_stop: string
  voice_cancel: string
  voice_preparing_microphone: string
  voice_transcribing: string
  voice_recording: string
  voice_finishing_recording: string
  voice_transcription_error_title: string
  voice_transcription_failed: string
  voice_error_invalid_input: string
  voice_error_permission_denied: string
  voice_error_recording_failed: string
  voice_error_audio_too_short: string
  voice_error_no_speech: string
  voice_error_audio_too_large: string
  voice_error_unsupported_format: string
  voice_error_no_api_key: string
  voice_error_invalid_key: string
  voice_error_rate_limit: string
  voice_error_connection_error: string
  voice_error_timeout: string
  voice_error_cancelled: string
  voice_error_all_providers_failed: string
  voice_error_all_providers_exhausted: string
  voice_error_unknown: string
  /** HC-NEW-05: Error message when Speech Recognition API is unavailable (network error) */

  // Model selector
  model_no_key: string
  model_loading: string
  model_load_error: string
  model_refresh: string
  model_picker_model: string
  model_picker_choose: string
  model_picker_provider: string
  model_picker_advanced: string
  model_picker_details: string
  model_picker_model_details: string
  model_picker_search_placeholder: string
  model_picker_recent: string
  model_picker_no_results: string
  model_picker_back: string
  model_picker_model_id: string

  // Markdown chart renderer
  markdown_chart_value: string
  markdown_chart_bar: string
  markdown_chart_line: string
  markdown_chart_pie: string
  markdown_chart_total: string

  // Dictionary page
  dictionary_title: string
  dictionary_subtitle: string
  dictionary_term_label: string
  dictionary_term_placeholder: string
  dictionary_context_label: string
  dictionary_context_placeholder: string
  dictionary_context_optional: string
  dictionary_lookup_region: string
  dictionary_source_lang: string
  dictionary_target_lang: string
  dictionary_lookup: string
  dictionary_lookup_loading: string
  dictionary_empty_title: string
  dictionary_empty_desc: string
  dictionary_empty_hints: string[]
  dictionary_no_matches: string
  dictionary_result_title: string
  dictionary_pronunciation: string
  dictionary_part_of_speech: string
  dictionary_meaning: string
  dictionary_translations: string
  dictionary_translation_detail: string
  dictionary_translation_usage: string
  dictionary_translation_nuance: string
  dictionary_meaning_in_context: string
  dictionary_translation_nuance_of: string
  dictionary_translation_example: string
  dictionary_translation_collocations: string
  dictionary_translation_close: string
  dictionary_selection_lookup: string
  dictionary_selection_lookup_loading: string
  dictionary_examples: string
  dictionary_notes: string
  dictionary_favorite: string
  dictionary_unfavorite: string
  dictionary_recent: string
  dictionary_favorites: string
  dictionary_no_recent: string
  dictionary_no_favorites: string
  dictionary_delete: string
  dictionary_clear_history: string
  dictionary_reuse_translate: string
  dictionary_copy: string
  dictionary_copied: string
  dictionary_error_retry: string
  dictionary_error_required: string
  dictionary_error_too_long: string
  dictionary_error_context_too_long: string
  dictionary_error_failed: string
  dictionary_error_invalid_response: string
  dictionary_error_truncated: string
  dictionary_error_same_lang: string
  /** Confirmation message shown before clearing all non-favorite history entries */
  dictionary_clear_history_confirm: string
  /** Accessible label on the pulsing dot shown while detail enrichment is in progress */
  dictionary_enriching: string
  dictionary_lookup_needs_model: string
  dictionary_no_model_title: string
  dictionary_no_model_action: string
  dictionary_clear_history_cancel: string
  dictionary_history_label: string

  // Language selector
  lang_auto: string
  /** Localized names for each language code (used in LanguageSelector) */
  lang_names: Record<string, string>

  // Settings page
  settings_title: string
  settings_subtitle: string
  settings_security_title: string
  settings_security_desc: string
  settings_security_macos: string
  settings_security_windows: string
  settings_api_keys: string
  /** Settings navigation: one-line purpose of the AI Providers section. */
  settings_api_keys_desc: string
  settings_configured: string
  settings_cost_currency: string
  settings_cost_total: string
  // Cost tracking — overview / dashboard
  settings_cost_section_title: string
  settings_cost_section_desc: string
  settings_cost_overview_total: string
  settings_cost_overview_total_desc: string
  settings_cost_overview_requests: string
  settings_cost_overview_tokens: string
  settings_cost_overview_avg: string
  settings_cost_overview_no_data: string
  settings_cost_overview_no_data_desc: string
  settings_cost_overview_estimated: string
  settings_cost_reset_all: string
  settings_cost_reset_all_confirm: string
  settings_cost_reset_provider: string
  settings_cost_reset_provider_confirm: string
  settings_cost_feature_chat: string
  settings_cost_feature_translate: string
  settings_cost_feature_live: string
  settings_cost_feature_dictionary: string
  settings_cost_input_tokens: string
  settings_cost_output_tokens: string
  settings_cost_total_tokens: string
  settings_cost_avg_per_request: string
  settings_cost_last_used: string
  settings_cost_last_used_just_now: string
  settings_cost_last_used_minutes: string
  settings_cost_last_used_hours: string
  settings_cost_last_used_days: string
  settings_cost_per_provider: string
  settings_cost_breakdown_by_feature: string
  settings_cost_no_activity: string
  settings_cost_first_request_hint: string
  settings_local_ai_title: string
  settings_local_ai_details: string
  settings_local_ai_desc: string
  settings_local_ai_performance: string
  settings_cloud_providers: string
  settings_cloud_providers_desc: string
  settings_web_search_jina: string
  settings_web_search_jina_desc: string
  settings_local_ai_running: string
  settings_local_ai_not_running: string
  settings_local_ai_unavailable: string
  settings_local_ai_model_waiting: string
  settings_local_ai_models_found: string
  settings_local_ai_start_runtime: string
  settings_local_ai_benchmark: string
  settings_local_perf_title: string
  settings_local_perf_description: string
  settings_local_perf_model: string
  settings_local_perf_compare: string
  settings_local_perf_reload_warning: string
  settings_local_perf_start: string
  settings_local_perf_dismiss: string
  settings_local_perf_stop: string
  settings_local_perf_running: string
  settings_local_perf_gpu: string
  settings_local_perf_hybrid: string
  settings_local_perf_auto: string
  settings_local_perf_mode: string
  settings_local_perf_ttft: string
  settings_local_perf_memory: string
  settings_local_perf_metrics_note: string
  settings_local_perf_recommended: string
  settings_local_perf_selected: string
  settings_local_perf_apply_note: string
  settings_local_perf_failed: string
  settings_local_perf_details: string
  settings_local_perf_recovered: string
  settings_local_perf_recovery_note: string
  settings_local_ai_benchmarking: string
  settings_local_ai_tier: string
  settings_local_ai_cpu_score: string
  settings_local_ai_memory_score: string
  settings_local_ai_runtime_speed: string
  settings_local_ai_runtime_latency: string
  settings_local_ai_benchmark_duration: string
  settings_local_ai_gpu_none: string
  settings_local_ai_gpu_offload: string
  settings_local_ai_gpu_spill_warning: string
  settings_local_ai_suggested_models: string
  settings_local_ai_model_size: string
  settings_local_ai_download_hint: string
  settings_local_ai_recommended: string
  settings_local_ai_installed: string
  settings_local_ai_download: string
  settings_local_ai_install_ollama: string
  settings_local_ai_install_runtime_title: string
  settings_local_ai_install_runtime_desc: string
  settings_local_ai_waiting_runtime: string
  settings_local_ai_manual_install_opened: string
  settings_local_ai_install_failed: string
  settings_local_ai_need_ollama: string
  settings_local_ai_downloaded: string
  settings_local_ai_downloading_model: string
  settings_local_ai_download_progress: string
  settings_local_ai_download_failed: string
  settings_local_ai_uninstall: string
  settings_local_ai_uninstalling: string
  settings_local_ai_uninstalled: string
  settings_local_ai_uninstall_failed: string
  settings_get_key: string
  settings_key_edit: string
  settings_key_add: string
  settings_key_saved: string
  settings_key_invalid: string
  settings_no_key: string
  /** HC-NEW-03: Placeholder when user has a key and hasn't started typing a new one */
  settings_key_placeholder_new: string
  /** HC-NEW-03: Placeholder when no key exists — template: "Paste your {name} API key…" */
  settings_key_placeholder_paste: string
  settings_verify_save: string
  settings_verifying: string
  settings_verified: string
  settings_try_again: string
  settings_show: string
  settings_hide: string
  settings_remove: string
  /** Confirm before removing a stored credential; `{name}` is the provider. */
  settings_remove_key_confirm: string
  /** Submit label for keys that are only stored, never verified (Groq, ElevenLabs). */
  settings_key_save: string
  settings_key_saving: string
  /** Confirm before uninstalling a local model; `{model}` is its id. */
  settings_local_ai_uninstall_confirm: string
  /** Confirm before deleting a system-prompt preset; `{name}` is the preset. */
  settings_chat_preset_delete_confirm: string
  /** Toast after "Use this prompt"; `{name}` is the preset. */
  settings_chat_preset_applied: string
  /** Toast when pruning or clearing stored chat images fails. */
  settings_chat_images_failed: string
  settings_msg_valid: string
  settings_msg_rate_limited: string
  settings_msg_billing: string
  settings_msg_permission: string
  settings_msg_invalid: string
  settings_msg_network: string
  settings_key_store_failed: string
  settings_prefs: string
  settings_prefs_desc: string
  settings_auto_translate: string
  settings_auto_translate_desc: string
  settings_translate_delay: string
  settings_translate_delay_desc: string
  settings_translate_mode: string
  settings_translate_mode_desc: string
  settings_mode_auto: string
  settings_mode_manual: string
  settings_app_language: string
  settings_app_language_desc: string
  settings_locale_auto: string
  settings_prefs_card_desc: string
  settings_delay_short: string
  settings_delay_medium: string
  settings_delay_long: string
  settings_theme_preview_heading: string
  settings_locale_auto_desc: string
  settings_font_size: string
  settings_font_size_desc: string
  settings_font_size_small: string
  settings_font_size_medium: string
  settings_font_size_large: string
  settings_appearance: string
  settings_appearance_desc: string
  settings_theme_mode: string
  settings_theme_desc: string
  settings_theme_light: string
  settings_theme_dark: string
  settings_theme_system: string
  settings_theme_dark_only_hint: string
  settings_theme_dark_only_badge: string
  settings_theme_preview_label: string
  settings_theme_preview_assistant: string
  settings_theme_preview_user: string
  settings_theme_preview_placeholder: string
  settings_theme_accent: string
  settings_theme_accent_desc: string
  settings_theme_accent_auto: string
  settings_theme_accent_violet: string
  settings_theme_accent_pink: string
  settings_theme_accent_teal: string
  settings_theme_accent_green: string
  settings_theme_accent_amber: string
  settings_theme_accent_red: string
  settings_theme_palette: string
  settings_theme_palette_desc: string
  settings_theme_preset_graphite: string
  settings_theme_preset_graphite_desc: string
  settings_theme_preset_glass: string
  settings_theme_preset_glass_desc: string
  settings_theme_preset_paper: string
  settings_theme_preset_paper_desc: string
  settings_theme_preset_corporate: string
  settings_theme_preset_corporate_desc: string
  settings_theme_preset_midnight: string
  settings_theme_preset_midnight_desc: string
  settings_furigana: string
  settings_furigana_desc: string
  settings_image_provider_fallback: string
  settings_image_provider_fallback_desc: string
  settings_launch_at_login: string
  settings_launch_at_login_desc: string
  settings_launch_at_login_error: string
  // Settings — Speech-to-Text section
  settings_stt_section: string
  settings_stt_section_desc: string
  /** Label for the "Provider" sub-header in STT section */
  settings_stt_provider_label: string
  settings_stt_provider_desc: string
  settings_stt_engine_name: string
  settings_stt_ready: string
  settings_stt_needs_key: string
  settings_stt_usage: string
  settings_stt_feature_voice: string
  settings_stt_feature_live: string
  // STT provider selector
  settings_stt_select_provider: string
  /** Auto mode option label */
  settings_stt_auto: string
  /** Auto mode description */
  settings_stt_auto_desc: string
  /** OpenAI Whisper option label */
  settings_stt_whisper: string
  /** OpenAI Whisper description */
  settings_stt_whisper_desc: string
  /** Google Cloud STT option label */
  settings_stt_google: string
  /** Google Cloud STT description */
  settings_stt_google_desc: string
  /** Note about enabling Speech API in GCP console */
  settings_stt_google_note: string
  /** Status badge: always available (no API key needed) */
  settings_stt_always_available: string
  /** Status badge: needs Gemini API key */
  settings_stt_needs_gemini: string
  /** Groq Whisper option label */
  settings_stt_groq: string
  /** Groq Whisper option description */
  settings_stt_groq_desc: string
  /** Status badge: needs Groq key */
  settings_stt_needs_groq: string

  settings_tts_section: string
  settings_tts_section_desc: string
  settings_voice_section: string
  settings_voice_section_desc: string
  settings_tts_elevenlabs_for_premium: string
  /** Short description of TTS provider priority order */
  settings_tts_priority_desc: string
  /** Label for the "Priority" sub-header in TTS section */
  settings_tts_priority_label: string
  settings_tts_mode: string
  settings_tts_mode_desc: string
  settings_tts_mode_free: string
  settings_tts_mode_free_desc: string
  settings_tts_mode_auto: string
  settings_tts_mode_auto_desc: string
  settings_tts_mode_premium: string
  settings_tts_mode_premium_desc: string
  settings_tts_elevenlabs_key: string
  settings_tts_elevenlabs_key_desc: string
  /** Placeholder text for ElevenLabs API key input */
  settings_tts_el_key_placeholder: string
  /** Success message after saving ElevenLabs key */
  settings_tts_el_saved: string
  /** Fallback error label when ElevenLabs save fails */
  settings_tts_el_failed: string
  /** Note about Edge TTS being free */
  settings_tts_edge_free_note: string
  settings_tts_voice: string
  settings_tts_voice_desc: string
  settings_tts_voice_alloy: string
  settings_tts_voice_echo: string
  settings_tts_voice_fable: string
  settings_tts_voice_onyx: string
  settings_tts_voice_nova: string
  settings_tts_voice_shimmer: string
  settings_about: string
  settings_about_desc: string
  settings_about_version: string
  settings_about_platform: string
  settings_about_supports: string
  settings_about_footer: string
  settings_about_tagline: string
  settings_about_version_label: string
  settings_about_up_to_date: string
  settings_about_feature_private: string
  settings_about_feature_private_desc: string
  settings_about_feature_everywhere: string
  settings_about_feature_everywhere_desc: string
  settings_about_feature_modules: string
  settings_about_feature_modules_desc: string
  settings_about_check_updates: string
  settings_about_system_info: string
  settings_about_local_ai: string
  settings_about_data: string
  settings_about_data_local: string
  settings_update_release_notes: string
  settings_update_status: string

  // Image translation — model switch notice
  /** Toast title when the system auto-switched to a different model for image translation */
  image_model_switched_title: string
  /** Template with {model} (now used) and {previous} (the model that cannot read images). */
  image_model_switched_message: string

  // Image translation
  image_translate_title: string
  image_translate_btn: string
  image_translate_upload_hint: string
  image_translate_processing: string
  /** HC-10: Sub-status shown while resizing/compressing the image */
  image_translate_compress_status: string
  image_translate_no_text: string
  image_translate_download: string
  image_translate_result_label: string
  image_translate_change: string
  image_translate_error_no_key: string
  /** HC-10: Error shown when user uploads a non-image file */
  image_translate_type_error: string
  /** Fallback error when image processing fails */
  image_translate_error_failed: string
  /** Error shown when the attached image exceeds the hard size limit (MB-templated) */
  image_translate_size_error: (maxMb: number) => string

  // History page
  history_search_placeholder: string
  history_search_clear: string
  history_no_results: string
  time_just_now: string
  time_m_ago: string
  time_h_ago: string
  time_d_ago: string
  history_trigger_label: string
  history_translate_count: string
  history_models_count: (count: number) => string
  history_live_count: string
  history_delete: string
  history_reuse: string
  history_chat_messages: string
  history_chat_delete: string

  // Live session history
  history_live_words: string

  // Live translate page
  nav_live_translate: string
  live_start: string
  live_stop: string
  live_status_listening: string
  live_chunk_hint: string
  live_empty: string
  live_empty_desc: string
  live_empty_system_desc: string
  live_empty_both_desc: string
  live_status_listening_mic: string
  live_status_listening_system: string
  live_status_listening_both: string
  live_entries_label: string
  live_clear: string
  live_copy_all: string
  live_copied: string
  live_no_stt_key: string
  live_no_translate_key: string
  live_status_translating: string
  live_status_stt: string
  live_panel_original: string
  live_panel_translation: string
  live_panel_transcript: string
  live_subtitles_floating: string
  live_session_panel_title: string
  live_session_summary_empty: string
  live_session_open_summary: string
  live_session_speakers: string
  live_session_speakers_empty: string
  live_session_speaker_lines: string
  live_session_export: string
  live_session_previous: string
  live_history_title: string
  live_history_toggle_show: string
  live_history_toggle_hide: string
  live_history_open: string
  live_history_empty: string
  live_history_clear: string
  live_history_clear_confirm: string
  live_words: string
  live_summarize: string
  live_summarize_again: string
  live_summarizing: string
  live_summary_title: string
  // Live — speaker analysis
  live_analyze_speakers: string
  live_analyze_speakers_again: string
  live_analyzing_speakers: string
  live_speakers_title: string
  live_speakers_rename_hint: string
  // Live — audio mode toggle
  live_audio_mode_mic: string
  live_audio_mode_mic_title: string
  live_audio_mode_system: string
  live_audio_mode_system_title: string
  live_audio_mode_both: string
  live_audio_mode_both_title: string
  // Live — screen recording permission hint
  live_screen_recording_hint: string
  live_open_system_settings: string
  // Live — subtitle controls
  live_subtitles: string
  live_subtitles_show_title: string
  live_subtitles_hide_title: string
  live_subtitle_config_title: string
  live_subtitle_text_color: string
  live_subtitle_font_size: string
  live_subtitle_bg_opacity: string
  live_subtitle_transparent: string
  live_subtitle_opaque: string
  live_subtitle_reset: string
  live_subtitle_color_white: string
  live_subtitle_color_yellow: string
  live_subtitle_color_cyan: string
  live_subtitle_color_green: string
  live_subtitle_color_orange: string
  live_subtitle_color_pink: string
  // Live — post-meeting analysis tabs
  live_post_tab_summary: string
  live_post_tab_actions: string
  live_post_tab_decisions: string
  // Live — action items
  live_action_items: string
  live_action_items_extract: string
  live_action_items_extract_again: string
  live_extracting_action_items: string
  // Live — decisions
  live_decisions: string
  live_decisions_extract: string
  live_decisions_extract_again: string
  live_extracting_decisions: string
  // Live — export
  live_export: string
  live_export_txt: string
  live_export_srt: string
  // Live — speaker rename
  live_speaker_rename_placeholder: string
  live_speaker_rename_save: string
  live_speaker_rename_cancel: string

  // Chat page
  chat_placeholder: string
  chat_send: string
  /** Tooltip / aria label on the in-progress Stop button shown while AI is generating. */
  chat_stop: string
  chat_clear: string
  chat_new_session: string
  chat_thinking: string
  chat_error_no_key: string
  chat_error_open_settings: string
  chat_attach_image: string
  chat_remove_image: string
  chat_menu_attach_files: string
  chat_menu_deep_research: string
  chat_menu_web_search: string
  chat_menu_instructions: string
  chat_copy: string
  chat_copied: string
  chat_voice_record: string
  chat_voice_stop: string
  chat_empty_desc: string
  chat_session_panel_empty: string
  chat_sidebar_label: string
  chat_sidebar_search: string
  chat_sidebar_recent: string
  chat_sidebar_no_results: string
  chat_sidebar_collapse: string
  chat_sidebar_expand: string
  chat_sidebar_switch_sessions: string
  chat_sidebar_conversations: string
  chat_sidebar_today: string
  chat_sidebar_this_week: string
  chat_sidebar_earlier: string
  chat_sidebar_paused: string
  chat_session_deleted: string
  chat_session_deleted_undo: string
  chat_task_language: string
  chat_task_configuration: string
  chat_task_trigger_label: string
  chat_web_source: string
  chat_web_source_hint: string
  chat_task_deep: string
  chat_task_none: string
  chat_task_scope: string
  chat_task_instruction: string
  chat_task_apply: string
  chat_task_discard: string
  chat_task_next_message: string
  chat_task_translate_placeholder: string
  chat_task_research_placeholder: string
  chat_task_explain_placeholder: string
  chat_task_write_placeholder: string
  chat_task_depth: string
  chat_task_level: string
  chat_task_format: string
  chat_task_overview: string
  chat_task_simple: string
  chat_task_steps: string
  chat_task_technical: string
  chat_task_email: string
  chat_task_article: string
  chat_task_rewrite: string
  chat_task_current_mode: string
  chat_task_planned_mode: string
  chat_task_mode_changed: string
  chat_task_back: string
  chat_task_unapplied: string
  chat_task_applied: string
  chat_task_needs_content: string
  chat_task_close: string
  chat_task_show: string
  chat_task_instructions: string
  chat_task_hint: string
  chat_task_translate_template: string
  chat_task_research_template: string
  chat_task_explain_template: string
  chat_task_write_template: string
  chat_suggest_translate: string
  chat_suggest_translate_desc: string
  chat_suggest_translate_prompt: string
  chat_suggest_research: string
  chat_suggest_research_desc: string
  chat_suggest_research_prompt: string
  chat_suggest_explain: string
  chat_suggest_explain_desc: string
  chat_suggest_explain_prompt: string
  chat_suggest_write: string
  chat_suggest_write_desc: string
  chat_suggest_write_prompt: string

  chat_mode_chip_image: string
  chat_mode_chip_web: string
  chat_mode_chip_research: string
  chat_mode_standard: string
  chat_response_mode: string

  chat_system_prompt_placeholder: string
  chat_regenerate: string
  chat_used_model: (model: string) => string
  chat_web_search_fallback_title: string
  chat_web_search_fallback: (provider: string, reason: 'auth' | 'quota') => string
  chat_web_search_unavailable_title: string
  chat_web_search_unavailable: string
  settings_chat_images_title: string
  settings_chat_images_desc: string
  settings_chat_images_usage: string
  settings_chat_images_empty: string
  settings_chat_images_prune: string
  settings_chat_images_prune_desc: string
  settings_chat_images_clear: string
  settings_chat_images_clear_desc: string
  settings_chat_images_clear_confirm: string
  settings_chat_images_removed: string
  chat_image_unavailable: string
  chat_feedback_good: string
  chat_feedback_bad: string
  chat_download_image: string
  chat_open_image: string
  chat_image_preview: string
  chat_image_actions: string
  chat_close_image_preview: string
  chat_image_edit_done: string

  // Settings — Shortcuts (navigation entry covering every hotkey group)
  settings_hotkeys_nav: string
  settings_hotkeys_nav_desc: string
  // Settings — Modules (turn feature modules on or off)
  settings_modules_section: string
  settings_modules_section_desc: string
  settings_modules_pages_group: string
  settings_modules_system_group: string
  settings_modules_launcher_label: string
  settings_modules_launcher_desc: string
  settings_modules_browser_bridge_label: string
  settings_modules_browser_bridge_desc: string
  settings_modules_last_page_hint: string
  settings_modules_error: string
  /** `{module}` is the module's navigation label. */
  settings_modules_off_title: string
  settings_modules_off_desc: string
  settings_modules_turn_on: string

  // Thermal — temperatures, fans and CPU load
  thermal_title: string
  thermal_subtitle: string
  thermal_group_cpu: string
  thermal_group_gpu: string
  thermal_group_other: string
  thermal_fans_title: string
  /** `{n}` is the one-based fan number. */
  thermal_fan_name: string
  /** `{min}` and `{max}` are RPM values. */
  thermal_fan_range: string
  /** `{rpm}` is the target speed. */
  thermal_fan_target: string
  thermal_cpu_load: string
  thermal_hottest: string
  /** `{count}` is the number of temperature sensors. */
  thermal_sensor_count: string
  /** `{minutes}` is the length of the kept history. */
  thermal_history_hint: string
  thermal_no_fans: string
  thermal_no_sensors: string
  thermal_waiting: string
  thermal_unsupported_title: string
  thermal_unsupported_desc: string
  thermal_reader_missing_title: string
  thermal_reader_missing_desc: string
  thermal_error_title: string
  thermal_error_desc: string
  thermal_no_sensors_title: string
  thermal_no_sensors_desc: string
  thermal_retry: string
  /** Section title for the live reading outside the window, by placement. */
  thermal_tray_section_menu_bar: string
  thermal_tray_section_tray: string
  thermal_tray_enable: string
  thermal_tray_enable_desc_menu_bar: string
  thermal_tray_enable_desc_tray: string
  thermal_tray_metric: string
  thermal_tray_show_fan: string
  /** Layout of the menu bar item: one line of text, or the temperature stacked over the fan speed. */
  thermal_tray_layout: string
  thermal_tray_layout_inline: string
  thermal_tray_layout_stacked: string
  /** Fan speed as the raw RPM or shortened; the options carry an example. */
  thermal_tray_fan_format: string
  thermal_tray_fan_format_rpm: string
  thermal_tray_fan_format_short: string
  thermal_tray_show_unit: string
  thermal_tray_preview: string
  thermal_tray_error: string
  // Thermal — fan control (privileged helper, macOS)
  thermal_fan_control_title: string
  thermal_fan_control_desc: string
  thermal_fan_helper_unsupported: string
  thermal_fan_helper_missing: string
  thermal_fan_helper_idle_title: string
  thermal_fan_helper_idle_desc: string
  thermal_fan_helper_starting: string
  /** `{version}` is the helper's version string. */
  thermal_fan_helper_ready: string
  thermal_fan_helper_error_title: string
  thermal_fan_enable: string
  thermal_fan_disable: string
  thermal_fan_retry: string
  thermal_fan_restore_all: string
  thermal_fan_mode_auto: string
  thermal_fan_mode_fixed: string
  thermal_fan_mode_sensor: string
  thermal_fan_target_label: string
  thermal_fan_sensor_source: string
  /** Labels before the two threshold boxes, read as one sentence: "Speed up from [50] °C, full speed at [90] °C". */
  thermal_fan_sensor_low: string
  thermal_fan_sensor_high: string
  /** `{celsius}` is the source sensor's current reading, `{rpm}` the target it produces. */
  thermal_fan_sensor_now: string
  thermal_fan_sensor_missing: string
  // Fan rule sources (the picker): groups, meanings, and the advanced raw-sensor dialog
  thermal_fan_source_group_cpu: string
  thermal_fan_source_group_gpu: string
  thermal_fan_source_group_all: string
  thermal_fan_source_groups: string
  thermal_fan_source_kinds: string
  thermal_fan_source_advanced: string
  thermal_fan_source_dialog_title: string
  thermal_fan_source_dialog_desc: string
  thermal_fan_source_filter: string
  thermal_fan_source_filter_clear: string
  thermal_fan_source_no_match: string
  /** `{code}` is the raw sensor key the rule follows. */
  thermal_fan_source_raw: string
  thermal_fan_source_close: string
  /** Mode text shown while the helper is not driving the fans. */
  thermal_fan_mode_system: string
  /** The gear popover on the Thermal page. */
  thermal_options_title: string
  thermal_options_desc: string
  /** Popover subtitle where fan control exists, so sensor detection is in it too. */
  thermal_options_desc_fans: string
  /** Short helper status for the toolbar chip. */
  thermal_fan_helper_missing_short: string
  // Fan names from the machine
  thermal_fan_label_left: string
  thermal_fan_label_right: string
  thermal_fan_label_main: string
  thermal_fan_label_cpu: string
  thermal_fan_label_gpu: string
  thermal_fan_label_exhaust: string
  thermal_fan_label_intake: string
  thermal_fan_label_chassis: string
  // Fan ↔ sensor calibration
  thermal_fan_calibrate: string
  thermal_fan_calibrate_again: string
  thermal_fan_calibrate_desc: string
  thermal_fan_calibrate_cancel: string
  thermal_fan_calibrate_clear: string
  /** `{fan}` is the fan's name, `{current}` / `{total}` its position in the run, `{seconds}` the phase countdown. */
  thermal_fan_calibrate_progress: string
  thermal_fan_calibrate_phase_baseline: string
  thermal_fan_calibrate_phase_spin: string
  thermal_fan_calibrate_phase_settle: string
  thermal_fan_calibrate_done: string
  thermal_fan_calibrate_cancelled: string
  thermal_fan_calibrate_error: string
  /** `{date}` is when the calibration finished. */
  thermal_fan_calibrated_at: string
  /** One fan in the calibration summary: `{fan}` its name, `{count}` the sensors it owns. */
  thermal_fan_calibrate_fan_count: string
  /** Source option: the sensors the calibration found this fan cools; `{fan}` is the fan's name. */
  thermal_fan_source_affinity: string
  /** `{sensors}` lists the top sensor names. */
  thermal_fan_source_affinity_desc: string
  thermal_fan_calibrate_confirm_title: string
  thermal_fan_calibrate_confirm_accept: string
  thermal_sensors_title: string
  /** `{count}` sensors folded into a row and `{avg}` their average reading. */
  thermal_sensor_row_caption: string
  thermal_sensor_unlabeled: string
  thermal_sensor_expand: string
  thermal_sensor_collapse: string
  /** Tooltip of a group heading in the sensor table; `{group}` is the group's title. */
  thermal_group_expand: string
  thermal_group_collapse: string
  // Thermal — fan profiles
  thermal_fan_profiles_title: string
  thermal_fan_profiles_desc: string
  thermal_fan_profiles_need_helper: string
  thermal_fan_profile_custom: string
  thermal_fan_profile_save: string
  thermal_fan_profile_name_placeholder: string
  thermal_fan_profile_save_confirm: string
  thermal_fan_profile_save_cancel: string
  /** `{name}` is the profile's name. */
  thermal_fan_profile_delete: string
  thermal_fan_profile_error: string
  thermal_fan_profile_builtin_system: string
  thermal_fan_profile_builtin_system_desc: string
  thermal_fan_profile_builtin_quiet: string
  thermal_fan_profile_builtin_quiet_desc: string
  thermal_fan_profile_builtin_cool: string
  thermal_fan_profile_builtin_cool_desc: string
  thermal_fan_profile_builtin_gaming: string
  thermal_fan_profile_builtin_gaming_desc: string
  thermal_fan_profile_builtin_local_ai: string
  thermal_fan_profile_builtin_local_ai_desc: string
  /** `{reason}` is one of the `thermal_fan_reason_*` strings. */
  thermal_fan_restored_reason: string
  thermal_fan_reason_watchdog: string
  thermal_fan_reason_ceiling: string
  thermal_fan_reason_sleep: string
  thermal_fan_reason_wake: string
  thermal_fan_reason_disconnect: string
  thermal_fan_reason_client: string
  thermal_fan_disclaimer_intro_daemon: string
  thermal_fan_helper_section: string
  thermal_fan_helper_installed_desc: string
  thermal_fan_helper_not_installed_desc: string
  thermal_fan_helper_outdated_title: string
  thermal_fan_helper_outdated_desc: string
  thermal_fan_helper_update: string
  thermal_fan_helper_uninstall: string
  thermal_fan_helper_approval_title: string
  thermal_fan_helper_approval_desc: string
  thermal_fan_helper_approval_open: string
  thermal_fan_reason_start: string
  thermal_fan_reason_console_user: string
  thermal_fan_disclaimer_title: string
  thermal_fan_disclaimer_intro: string
  thermal_fan_disclaimer_point_range: string
  thermal_fan_disclaimer_point_restore: string
  thermal_fan_disclaimer_point_ceiling: string
  thermal_fan_disclaimer_warning: string
  thermal_fan_calibrate_confirm_intro: string
  thermal_fan_calibrate_confirm_point_time: string
  thermal_fan_calibrate_confirm_point_speed: string
  thermal_fan_calibrate_confirm_point_setup: string
  thermal_fan_disclaimer_accept: string
  thermal_fan_disclaimer_cancel: string
  thermal_fan_error: string
  thermal_label_cpu_core: string
  thermal_label_cpu_performance_core: string
  thermal_label_cpu_efficiency_core: string
  thermal_label_cpu_die: string
  thermal_label_cpu_proximity: string
  thermal_label_cpu_package: string
  thermal_label_gpu: string
  thermal_label_gpu_die: string
  thermal_label_gpu_proximity: string
  thermal_label_memory: string
  thermal_label_battery: string
  thermal_label_wifi: string
  thermal_label_airflow_left: string
  thermal_label_airflow_right: string
  thermal_label_palm_rest: string
  thermal_label_storage: string
  thermal_label_ambient: string
  thermal_label_display: string
  thermal_label_power: string
  thermal_label_thunderbolt: string
  thermal_label_skin: string
  // Settings — Global Hotkey
  settings_hotkey_section: string
  settings_hotkey_section_desc: string
  settings_hotkey_enabled: string
  settings_hotkey_enabled_desc: string
  settings_hotkey_label: string
  settings_hotkey_desc: string
  settings_hotkey_record: string
  settings_hotkey_recording: string
  settings_hotkey_clear: string
  settings_hotkey_none: string
  settings_hotkey_provider: string
  settings_hotkey_target_lang: string
  settings_hotkey_model: string
  settings_hotkey_status_translating: string
  settings_hotkey_status_done: string
  settings_hotkey_status_error: string
  settings_hotkey_conflict: string
  settings_hotkey_primary_lang: string
  settings_hotkey_secondary_lang: string
  settings_hotkey_secondary_off: string
  settings_hotkey_pair_desc: string
  settings_hotkey_pair_off_desc: string
  settings_hotkey_status_done_into: string
  settings_hotkey_accessibility_title: string
  settings_hotkey_accessibility_missing: string
  settings_hotkey_accessibility_granted: string
  settings_hotkey_accessibility_open: string
  settings_hotkey_error_accessibility: string
  settings_hotkey_error_copy_failed: string
  settings_hotkey_error_paste_failed: string
  settings_hotkey_error_translate_failed: string
  settings_hotkey_register_conflict_launcher: string
  settings_hotkey_register_invalid: string
  settings_hotkey_needs_modifier: string
  settings_chat_hotkey_owner_finder_search: string
  settings_chat_hotkey_system_conflict_title: string
  settings_chat_hotkey_system_conflict_desc: string
  settings_chat_hotkey_system_conflict_open: string
  settings_chat_hotkey_system_conflict_use: string
  launcher_hotkey_system_conflict_toast: string
  launcher_hotkey_system_conflict_action: string
  launcher_spotlight_prompt_title: string
  launcher_spotlight_prompt_desc: string
  launcher_spotlight_prompt_note: string
  launcher_spotlight_prompt_replace: string
  launcher_spotlight_prompt_keep: string
  launcher_spotlight_replaced: string
  launcher_spotlight_relogin: string
  launcher_spotlight_replace_failed: string
  launcher_spotlight_kept: string
  settings_chat_hotkey_spotlight_disable: string
  settings_chat_hotkey_spotlight_disabled_title: string
  settings_chat_hotkey_spotlight_disabled_desc: string
  settings_chat_hotkey_spotlight_restore: string
  settings_chat_hotkey_spotlight_restored: string
  settings_chat_hotkey_spotlight_restore_failed: string

  // Settings — Legacy Assistant (no-extension injection)
  settings_la_section: string
  settings_la_section_desc: string
  settings_la_auto_enabled: string
  settings_la_auto_enabled_desc: string
  settings_la_inject_now: string
  settings_la_target_lang: string
  settings_la_bookmarklet_label: string
  settings_la_bookmarklet_desc: string
  settings_la_bookmarklet_copy: string
  settings_la_bookmarklet_copied: string
  settings_la_bookmarklet_drag_hint: string
  settings_la_macos_only: string

  /** HC-NEW-06: Label for the Chrome Extension subsection header */
  settings_chrome_extension_label: string
  // Settings — Chrome Extension
  settings_extension_section: string
  settings_extension_section_desc: string
  settings_extension_token_label: string
  settings_extension_token_desc: string
  settings_extension_token_copy: string
  settings_extension_token_copied: string
  settings_extension_token_regenerate: string
  settings_extension_install_hint: string
  settings_extension_port: string
  settings_extension_connected: string
  /** Download & install card */
  settings_extension_download_title: string
  settings_extension_download_desc: string
  settings_extension_download_btn: string
  settings_extension_install_step1: string
  settings_extension_install_step2: string
  settings_extension_install_step3: string
  settings_extension_install_step4: string

  // Settings — Updates
  settings_update_section: string
  update_popup_download: string
  update_popup_title: string
  update_popup_ready_title: string
  update_popup_version: string
  update_popup_description: string
  update_popup_ready_description: string
  update_popup_enabled: string
  update_popup_enabled_description: string
  update_popup_view: string
  update_popup_later: string
  update_popup_close: string
  update_popup_minimize: string
  update_notification_description: string
  update_notification_later: string
  update_notification_release_notes: string
  update_notification_action_error: string
  settings_update_section_desc: string
  settings_update_current_version: string
  settings_update_check: string
  settings_update_checking: string
  settings_update_available: string
  settings_update_not_available: string
  settings_update_downloading: string
  settings_update_downloaded: string
  settings_update_download: string
  /** macOS only: label for downloading the unsigned DMG in-app. */
  settings_update_download_installer: string
  /** Fallback label for opening the browser to download the DMG. */
  settings_update_download_browser: string
  settings_update_install: string
  settings_update_open_installer: string
  settings_update_error: string
  settings_update_error_codesign: string

  // Settings — Legacy Browser / Bookmarklet
  settings_legacy_section: string
  settings_legacy_section_desc: string
  settings_bookmarklet_desc: string
  settings_bookmarklet_step1: string
  settings_bookmarklet_alt_hint: string
  settings_bookmarklet_reload: string
  settings_bookmarklet_reload_title: string
  settings_bookmarklet_loading: string
  settings_bookmarklet_copy: string
  settings_bookmarklet_copied: string
  settings_bookmarklet_step2: string
  settings_bookmarklet_step2_desc: string
  /** Draggable bookmarklet link label text */
  settings_bookmarklet_label: string

  // Settings — Token management
  settings_token_manage: string
  settings_token_create: string
  settings_token_name_label: string
  settings_token_ttl_label: string
  settings_token_ttl_7: string
  settings_token_ttl_30: string
  settings_token_ttl_90: string
  settings_token_ttl_365: string
  settings_token_cancel: string
  settings_token_generate: string
  settings_token_reveal_body: string
  settings_token_reveal_title: string
  settings_token_close: string
  settings_token_copy: string
  settings_token_copied: string
  settings_token_expires_label: string
  settings_token_error_connect: string
  settings_token_error_load: string
  settings_token_retry: string
  settings_token_loading: string
  settings_token_empty: string
  settings_token_expired: string
  settings_token_days_warning: string
  settings_token_days_info: string
  settings_token_regenerate_title: string
  settings_token_regenerate: string
  settings_token_delete_title: string
  settings_token_copy_url_title: string
  settings_token_error_create: string
  settings_token_error_delete: string
  settings_token_error_regenerate: string
  settings_token_ipc_error: string
  settings_preset_use_prompt: string

  // AI Chat Quick-Ask Popup (hotkey-triggered)
  ai_chat_popup_title: string
  ai_chat_popup_placeholder: string
  ai_chat_popup_placeholder_mod_enter: string
  ai_chat_popup_followup_placeholder: string
  ai_chat_popup_empty_desc: string
  ai_chat_popup_open_in_chat: string
  ai_chat_popup_short_label: string
  ai_chat_popup_input_too_long: string
  ai_chat_popup_new_line: string
  ai_chat_popup_close: string
  ai_chat_popup_turns: string
  ai_chat_popup_new_conversation: string
  ai_chat_popup_change_model: string
  ai_chat_popup_model_default: string
  ai_chat_popup_question_badge: string
  ai_chat_popup_model_ready: string

  // Settings — AI Chat Hotkey
  settings_chat_hotkey_section: string
  settings_chat_hotkey_section_desc: string
  settings_chat_hotkey_enabled: string
  settings_chat_hotkey_enabled_desc: string
  settings_chat_hotkey_label: string
  settings_chat_hotkey_desc: string
  settings_chat_hotkey_recording: string
  settings_chat_hotkey_clear: string
  settings_chat_hotkey_none: string
  settings_chat_hotkey_status_conflict: string
  launcher_title: string
  launcher_placeholder: string
  launcher_results: string
  launcher_ai: string
  launcher_web: string
  launcher_app: string
  launcher_command: string
  launcher_loading: string
  launcher_apps_unavailable: string
  launcher_retry: string
  launcher_open_failed: string
  launcher_select: string
  launcher_open: string
  launcher_back: string
  launcher_hotkey_failed: string
  launcher_section_recent: string
  launcher_section_apps: string
  launcher_section_viezan: string
  launcher_section_use_with: string
  launcher_translate: string
  launcher_dictionary: string
  launcher_live: string
  launcher_ai_hint: string
  launcher_continue: string
  launcher_ai_followup: string
  launcher_calculator: string
  launcher_currency: string
  launcher_copy: string
  /** `{from}` / `{to}` are ISO codes, `{rate}` a formatted number, `{date}` a formatted day. */
  launcher_currency_rate: string
  launcher_currency_loading: string
  launcher_currency_unavailable: string
  launcher_currency_target: string
  launcher_currency_search: string
  launcher_currency_no_results: string
  launcher_section_files: string
  launcher_file: string
  launcher_folder: string
  launcher_reveal: string

  // Settings — AI Chat section
  settings_chat_section: string
  settings_chat_section_desc: string
  settings_chat_go_to_chat: string
  settings_chat_shortcuts: string
  settings_chat_shortcuts_desc: string
  settings_chat_shortcut_send: string
  settings_chat_shortcut_send_desc: string
  settings_chat_shortcut_send_enter: string
  settings_chat_shortcut_send_mod_enter: string
  settings_chat_shortcut_new_chat: string
  settings_chat_shortcut_new_chat_desc: string
  settings_chat_shortcut_restore_default: string
  settings_chat_presets: string
  settings_chat_presets_empty: string
  settings_chat_preset_add: string
  settings_chat_preset_name: string
  settings_chat_preset_name_placeholder: string
  settings_chat_preset_content: string
  settings_chat_preset_set_default: string
  settings_chat_preset_is_default: string
  settings_chat_preset_edit: string
  settings_chat_preset_delete: string
  settings_chat_preset_save: string
  settings_chat_preset_cancel: string


  // Settings — Web Search (Deep Research)
  settings_web_search_section: string
  settings_web_search_title: string
  settings_web_search_desc_prefix: string
  settings_web_search_desc_suffix: string

  // Settings — TTS ElevenLabs delete confirm

  // Settings modal close
  settings_close: string

  // Chat — Deep Research
  chat_deep_research_api: string

  // Chat — Deep Research pipeline (steps + statuses surfaced inside the chat thread)
  /** Phase 1 step label */
  chat_deep_research_step_analyze: string
  /** Phase 2 step label — template `{aspect}` */
  chat_deep_research_step_round1: string
  /** Phase 3 step label — template `{round}` */
  chat_deep_research_step_gap: string
  /** Phase 3b deep-dive step label — template `{aspect}` */
  chat_deep_research_step_deep: string
  /** Phase 4 step label */
  chat_deep_research_step_cross: string
  /** Phase 5 step label */
  chat_deep_research_step_synth: string
  /** Banner shown when Tavily web search is available */
  chat_deep_research_mode_realtime: string
  /** Banner shown when no Tavily key is configured */
  chat_deep_research_mode_ai_only: string
  /** Plan summary header — template `{count}` */
  chat_deep_research_will_study: string
  /** Image context line — template `{context}` */
  chat_deep_research_image_context: string
  /** Image-derived search terms line — template `{terms}` */
  chat_deep_research_image_terms: string
  /** Knowledge-base label for image context (Phase 1) */
  chat_deep_research_image_kb_label: string
  /** Fallback prompt used when Deep Research is triggered with only an image (no text) */
  chat_deep_research_image_only_prompt: string
  /** Gap analysis: research is sufficient */
  chat_deep_research_complete: string
  /** Gap analysis: gaps found header — template `{count}` */
  chat_deep_research_gaps_found: string
  /** Inline label prefix for deep-dive sub-aspects */
  chat_deep_research_deeper_label: string
  /** Inline message: cannot analyze aspect — template `{error}` */
  chat_deep_research_cannot_analyze: string
  /** Inline message: cannot research deep gap — template `{error}` */
  chat_deep_research_cannot_research: string
  /** Inline message: cross-reference failed (returned to UI) — template `{error}` */
  chat_deep_research_cross_failed: string
  /** Inline message: cross-reference failed (knowledge-base entry) — template `{error}` */
  chat_deep_research_cross_failed_inline: string
  /** Inline message: synthesis failed — template `{error}` */
  chat_deep_research_synth_failed: string
  /** Inline error wrapper — template `{error}` */
  chat_deep_research_error_inline: string
  /** Step-error fallback when analyze fails */
  chat_deep_research_error_analyze: string
  /** Generic single-word "error" used as fallback */
  chat_deep_research_error_generic: string
  /** Step-error fallback when gap evaluation fails */
  chat_deep_research_error_eval: string
  /** Step-error fallback when cross-reference fails */
  chat_deep_research_error_cross: string
  /** Step-error fallback when synthesis fails */
  chat_deep_research_error_synth: string
  /** Generic "Unknown error" fallback used when chat returns empty */
  chat_deep_research_error_unknown: string
  /** Web search summary block label */
  chat_deep_research_web_summary: string

  /** Service fallback used by chatService when the editChatImage IPC bridge is missing */
  chat_error_image_edit_bridge: string

  // Chat — Smart Thinking (AI auto-decides whether to web-search)
  chat_smart_thinking_enable: string
  chat_smart_thinking_disable: string
  chat_smart_thinking_hint: string
  chat_smart_thinking_badge: string

  chat_web_search_badge: string
  chat_web_search_hint: string

  chat_image_mode_badge: string
  chat_image_mode_hint: string
  /** Shown when the selected provider has no image generation/editing support. */
  chat_image_mode_unsupported_provider: string
  chat_image_generate_done: string
  chat_error_image_generate_failed: string
  chat_error_image_generate_reload_required: string
  chat_menu_image_mode: string

  chat_smart_thinking_searching: string
  chat_smart_thinking_step_label_prefix: string
  chat_smart_thinking_summary_title: string
  chat_smart_thinking_default_reason: string
  chat_smart_thinking_sources_title: string
  chat_smart_thinking_no_sources: string
  chat_smart_thinking_no_results: string
  chat_smart_thinking_search_error: string
  chat_smart_thinking_no_response: string
  chat_smart_thinking_unknown_error: string

  // Chat — error messages
  chat_error_unexpected: string
  chat_error_failed_response: string
  chat_error_failed_image_edit: string
  chat_error_image_edit_reload_required: string
  chat_error_invalid_key: string
  chat_error_rate_limit: string
  chat_error_network: string
  chat_error_timeout: string
  chat_error_empty_response: string
  chat_error_blocked_recitation: string
  chat_error_blocked_safety: string
  chat_error_model_refusal: string
  chat_error_no_image_edit: string

  // Live — audio source section label
  live_audio_source_label: string

  // Live — export file section headers
  live_export_header: string
  live_export_original_section: string
  live_export_translation_section: string
  live_export_summary_section: string
  live_export_action_items_section: string
  live_export_decisions_section: string

  // Live — subtitle on/off toggle label
  live_subtitles_on: string
  live_view_mode_label: string
  live_view_split: string
  live_view_paired: string
  live_jump_latest: string
  live_copy_original: string
  live_copy_translation: string
  live_input_level: string
  live_elapsed: string
  // Live — transcript section label
  live_transcript_label: string
  // Live — default speaker label
  live_speaker_default: string
  // Live — Screen Recording permission modal title
  live_screen_permission_title: string

  // Chat — MessageBubble
  chat_thinking_label: string
  /** Header label shown on the grouped research-steps panel once every step
   *  in a Deep Research run has finished, e.g. "Đã suy nghĩ". */
  chat_research_done_label: string
  /** Unit word appended after the step count in the grouped header,
   *  e.g. "bước" / "steps". The full header reads
   *  `${chat_research_done_label} · ${count} ${chat_research_steps_unit}`. */
  chat_research_steps_unit: string
  /** Suffix appended to a research-pill row when multiple steps of the same
   *  phase have been collapsed, e.g. ` · 4 khía cạnh` / ` · 4 aspects`.
   *  Template `{count}` — full row reads `${stepLabel} · {count} aspects`. */
  chat_research_aspects_suffix: string
  /** Accessible label for the research phase details popover trigger. */
  chat_research_show_details: string
  chat_research_title: string
  chat_research_step_of: string
  chat_research_progress_label: string
  chat_research_status_done: string
  chat_research_status_active: string
  chat_research_status_pending: string
  chat_research_status_error: string
  chat_research_stopped: string
  chat_research_failed: string
  chat_research_retry_step: string
  chat_attachment_model_cannot_read: string
  chat_attachment_model_may_not_read: string
  chat_error_retry: string
  chat_error_change_model: string
  chat_edit_this_image: string
  /** Label on the "Resume Deep Research" button in ResearchStepsPanel
   *  shown when a stopped pipeline has a persisted resume snapshot. */
  chat_deep_research_resume: string
  chat_deep_research_retry: string
  chat_deep_research_retry_short: string
  /** Short label used inside the compact composer Resume button. */
  chat_deep_research_resume_short: string

  chat_deep_research_summarizing: string
  chat_deep_research_badge: string


  // Live — runtime error messages
  live_error_title: string
  live_error_stt_failed: string
  live_error_translation_failed: string
  live_sentence_pending: string
  live_sentence_provisional: string
  live_sentence_incomplete: string
  live_error_backlog: string
  live_error_system_audio_unavailable: string
  live_error_screen_permission_denied: string
  live_error_mic_denied: string
  /**
   * Error shown when ALL STT providers (Whisper, Gemini, Groq) are unavailable or failed.
   * The live session is stopped automatically when this occurs.
   */
  live_error_all_stt_exhausted: string
  // STT — Groq API key (optional free fallback)
  /** Label for the Groq API key input in STT Settings */
  settings_stt_groq_key: string
  /** Description for the Groq API key input */
  settings_stt_groq_key_desc: string
  /** Placeholder text for the Groq API key input */
  settings_stt_groq_key_placeholder: string
  /** Success message after saving Groq key */
  settings_stt_groq_saved: string
  /** Error label when Groq key save fails */
  settings_stt_groq_failed: string

  // Live — active STT backend badge
  /** Label prefix for the active STT backend badge, e.g. "STT:" */
  live_stt_badge_label: string
  /** Shown in the badge when no STT key is configured */
  live_stt_backend_none: string
}
