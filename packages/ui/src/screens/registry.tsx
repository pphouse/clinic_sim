/**
 * 訪問先の台帳。
 *
 * どの建物が実装済みで、何色で、どのアイコンか。**マップはここを読んで並べる。**
 * 画面を1枚足したらここに1行足す。ここに無い建物は地図に出ない
 * ＝行けない先を描かない（docs/spec/screens/map.md）。
 */
import type { ScreenId } from '@med/sim';
import type { Domain } from '../components/ScreenShell';
import iconAccounting from '../assets/icon-accounting.svg';
import iconAgency from '../assets/icon-agency.svg';
import iconBank from '../assets/icon-bank.svg';
import iconBureau from '../assets/icon-bureau.svg';
import iconHq from '../assets/icon-hq.svg';
import iconIgyoku from '../assets/icon-igyoku.svg';
import iconPersonnel from '../assets/icon-personnel.svg';
import iconSchool from '../assets/icon-school.svg';

export interface BuildingMeta {
  id: ScreenId;
  name: string;
  /** 一言でこの建物の役割。マップの札に出す */
  role: string;
  domain: Domain;
  icon: string;
  /** ヘッダの副題。Coffee Inc に倣って実在の住所を出す */
  address: string;
}

export const BUILDINGS: BuildingMeta[] = [
  { id: 'hq', name: '本社', role: '全社の現在地', domain: 'hq', icon: iconHq, address: '東京都文京区本郷' },
  { id: 'accounting', name: '経理', role: '三表', domain: 'hq', icon: iconAccounting, address: '本社2階' },
  { id: 'personnel', name: '人事', role: '医師と看護師', domain: 'hq', icon: iconPersonnel, address: '本社2階' },
  { id: 'igyoku', name: '医局', role: '常勤医の派遣枠', domain: 'igyoku', icon: iconIgyoku, address: '東京都文京区本郷7-3-1' },
  { id: 'agency', name: '紹介会社', role: '金で買える枠', domain: 'agency', icon: iconAgency, address: '東京都千代田区大手町' },
  { id: 'nursingSchool', name: '看護学校', role: '看護師の長期供給', domain: 'school', icon: iconSchool, address: '東京都文京区小石川' },
  { id: 'bank', name: '銀行', role: '借入と資金繰り', domain: 'bank', icon: iconBank, address: '東京都中央区日本橋' },
  { id: 'bureau', name: '厚生局', role: '施設基準と加算', domain: 'bureau', icon: iconBureau, address: '東京都千代田区九段' },
];

export function buildingOf(id: ScreenId): BuildingMeta | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
