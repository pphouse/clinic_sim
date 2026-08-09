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
import iconCare from '../assets/icon-care.svg';
import iconEstate from '../assets/icon-estate.svg';
import iconHospital from '../assets/icon-hospital.svg';
import iconHq from '../assets/icon-hq.svg';
import iconIgyoku from '../assets/icon-igyoku.svg';
import iconPersonal from '../assets/icon-personal.svg';
import iconPersonnel from '../assets/icon-personnel.svg';
import iconPharmacy from '../assets/icon-pharmacy.svg';
import iconSchool from '../assets/icon-school.svg';
import iconShikai from '../assets/icon-shikai.svg';
import iconVendor from '../assets/icon-vendor.svg';

/**
 * 訪問先の束ね方。
 *
 * 15個をのっぺり並べると、どれから見ればいいのか分からない。
 * **「何をしに行く先か」で3つに割る。** 場所の種類（社内／社外）ではなく
 * 目的で割っているのは、プレイヤーが探すときの手がかりが目的の方だから。
 */
export type BuildingGroup = '自社' | '人と患者を集める' | '金・物・制度';

export const BUILDING_GROUPS: BuildingGroup[] = ['自社', '人と患者を集める', '金・物・制度'];

export interface BuildingMeta {
  id: ScreenId;
  group: BuildingGroup;
  name: string;
  /** 一言でこの建物の役割。マップの札に出す */
  role: string;
  domain: Domain;
  icon: string;
  /** ヘッダの副題。Coffee Inc に倣って実在の住所を出す */
  address: string;
}

export const BUILDINGS: BuildingMeta[] = [
  { id: 'hq', group: '自社', name: '本社', role: '全社の現在地', domain: 'hq', icon: iconHq, address: '東京都文京区本郷' },
  { id: 'accounting', group: '自社', name: '経理', role: '三表', domain: 'hq', icon: iconAccounting, address: '本社2階' },
  { id: 'personnel', group: '自社', name: '人事', role: '医師と看護師', domain: 'hq', icon: iconPersonnel, address: '本社2階' },
  { id: 'igyoku', group: '人と患者を集める', name: '医局', role: '常勤医の派遣枠', domain: 'igyoku', icon: iconIgyoku, address: '東京都文京区本郷7-3-1' },
  { id: 'agency', group: '人と患者を集める', name: '紹介会社', role: '金で買える枠', domain: 'agency', icon: iconAgency, address: '東京都千代田区大手町' },
  { id: 'nursingSchool', group: '自社', name: '看護学校', role: '看護師の長期供給', domain: 'school', icon: iconSchool, address: '東京都文京区小石川' },
  { id: 'bank', group: '金・物・制度', name: '銀行', role: '借入と資金繰り', domain: 'bank', icon: iconBank, address: '東京都中央区日本橋' },
  { id: 'bureau', group: '金・物・制度', name: '厚生局', role: '施設基準と加算', domain: 'bureau', icon: iconBureau, address: '東京都千代田区九段' },
  { id: 'medicalAssociation', group: '人と患者を集める', name: '地域医師会', role: '当番医と成長ブレーキ', domain: 'shikai', icon: iconShikai, address: '東京都文京区本郷' },
  { id: 'referralHospital', group: '人と患者を集める', name: '連携基幹病院', role: '紹介患者', domain: 'hospital', icon: iconHospital, address: '東京都文京区湯島' },
  { id: 'careManager', group: '人と患者を集める', name: 'ケアマネ', role: '在宅の紹介', domain: 'hospital', icon: iconCare, address: '東京都文京区千駄木' },
  { id: 'pharmacy', group: '金・物・制度', name: '門前薬局', role: '賃料収入', domain: 'pharmacy', icon: iconPharmacy, address: 'A院 隣地' },
  { id: 'vendor', group: '金・物・制度', name: '機器商社', role: 'カルテとAIと機器', domain: 'vendor', icon: iconVendor, address: '東京都港区芝浦' },
  { id: 'realEstate', group: '金・物・制度', name: '不動産', role: 'テナントか保有か', domain: 'bank', icon: iconEstate, address: '東京都中央区京橋' },
  { id: 'personalWealth', group: '自社', name: '個人資産', role: '院長個人の口座', domain: 'hq', icon: iconPersonal, address: '院長私邸' },
];

export function buildingsInGroup(group: BuildingGroup): BuildingMeta[] {
  return BUILDINGS.filter((b) => b.group === group);
}

export function buildingOf(id: ScreenId): BuildingMeta | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
