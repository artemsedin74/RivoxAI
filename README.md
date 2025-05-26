```ts
Нужно сделать JSON конфиг для набора пользовательских действий для сайта.

Конфиг это массив массивов так называемых conditions.
Conditions это объект с такими типами:


{
  feature: TFeature,
  threshold: number,
  operator: ">" | "<" | ">=" | "<=" | "="
}

А feature это ключи объекта

type TSessionFeatureProjection = export interface TSessionFeatureProjection {
  /**
   * @remarks
   * Целое число в диапазоне от 0 до 23
   */
  hour: number;

  /**
   * @remarks
   * Целое число в диапазоне от 0 до 6
   */
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;

  session_duration_m: number;
  cta_clicks_count: number;
  interactions_per_minute: number;
  cta_per_minute: number;
  time_to_first_interaction_minutes: number;
  engagement_speed: number;
  interactions_per_page: number;
  cta_per_page: number;
  products_per_page: number;
  total_interactions: number;
  product_view_rate: number;
  cart_conversion_rate: number;
  scroll_per_interaction: number;
  scroll_efficiency: number;
  scroll_depth_max: number;
  scroll_speed: number;

  /**
   * @remarks
   * Значения: от 0 до 1
   */
  is_browser: number;

  /**
   * @remarks
   * Значения: от 0 до 1
   */
  is_focused: number;

  /**
   * @remarks
   * Значения: от 0 до 1
   */
  is_business_hours: number;

  /**
   * @remarks
   * Значения: от 0 до 1
   */
  is_weekend: number;

  activity_index: number;
  session_quality: number;
}


Мне нужно чтобы ты или сгенерировал валидный конфиг на на основе следующий данных, или перечислил список ошибок. Валидный конфиг это тот, для которого для всех данных:

1. Перечислены только известные ключи
2. Если у поля указаны ограничения, то они ограничения соблюдаются

Отвечай лаконично или "Вот конфиг, ошибок нет" или "Вот список ошибок"

Сами данные:
```
