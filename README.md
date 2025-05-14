# RivoxAI

## Поддерживаемые Feature

| Feature                  | Единица измерения `threshhold`     | Условие прохождения                                     |
|--------------------------|------------------------------------|---------------------------------------------------------|
| `session_duration_m`     | Минуты                             | `session.duration / 60000 >= threshhold`                |
| `scroll_depth_max`       | Проценты (может быть и больше 100) | `session.scroll_depth_max >= threshhold`                |
| `time_first_interaction` | Миллисекунды                       | `time_to_first_interaction <= threshhold`               |
| `total_interactions`     | Целое число                        | `session.user_behavior.total_interactions >= threshhold`|
| `cta_clicks_count`       | Целое число                        | `session.cta_clicks >= threshhold`                      |
| `scroll_speed`           | Кол-во скролл-событий в минуту     | `session.ml_features.behavior_patterns... >= threshhold`|
