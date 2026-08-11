# 画面仕様：看護学校

> ステータス: **実装済み**
> 担当ブランチ: `feature/screen-nursingSchool`
> ScreenId: `nursingSchool`
> 領域色: `school`

## この画面の唯一の仕事

**3年待てるか**を問う画面。看護師のボトルネックを外す唯一の手段だが、効くのは3年後。

## 表示するデータ

sim から読む値だけを列挙する。UI で計算しない（CLAUDE.md §2）。

| 表示名 | sim のフィールド |
|---|---|
| 開校月 | `schoolStatus().openedAtMonth` |
| 在学学年数 | `schoolStatus().enrolledClasses` |
| 学費収入 | `IncomeStatement.tuitionRevenue` |
| 運営費 | `IncomeStatement.schoolOperating` |
| 次の卒業月 | `schoolStatus().nextGraduationMonth` |
| 1学年から残る人数 | `SCHOOL_GRADUATES_PER_CLASS`（40 × 85% × 35% ＝ 11.9） |
| 今月の入職 | `StaffTick.nursesFromSchool` |

未開校なら「未開校」とだけ出し、判断材料（3年かかること・その間は運営費だけ出ること）を書く。

## プレイヤーができること

| 操作 | 効果 | 遅延 |
|---|---|---|
| 開校する | 校舎が固定資産に載る。運営費が毎月出ていく | **卒業生は36ヶ月後** |

2.5 億は費用ではなく校舎という資産なので、純資産は毀損しない。
**現金だけが沈む。** ここで債務超過に見えるのは資金繰りの谷であって破綻ではない
（`03-game.md` の終局判定が12ヶ月の猶予を持つのはこのため）。


## やらないこと

- **定員や学費の調整。** 検証モデルに無い。入れるなら先に 01-simulation-core.md へ
- **卒業生の質。** 人数しか持たない
