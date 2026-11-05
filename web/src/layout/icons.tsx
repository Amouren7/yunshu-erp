import type { ReactNode } from 'react';
import {
  AppstoreOutlined, DashboardOutlined, DatabaseOutlined, ShoppingCartOutlined, ShoppingOutlined,
  InboxOutlined, BuildOutlined, BankOutlined, TeamOutlined, ContactsOutlined, BarChartOutlined,
  SettingOutlined, FileTextOutlined, ProfileOutlined, AuditOutlined, AccountBookOutlined,
  MoneyCollectOutlined, CreditCardOutlined, PayCircleOutlined, TransactionOutlined,
  UnorderedListOutlined, TableOutlined, LineChartOutlined, PieChartOutlined, FundOutlined,
  ClusterOutlined, ApartmentOutlined, UserOutlined, SolutionOutlined, CalendarOutlined,
  ScheduleOutlined, CarryOutOutlined, TagOutlined, BarcodeOutlined, ShopOutlined,
  TruckOutlined, ToolOutlined, ExperimentOutlined, AlertOutlined, SafetyCertificateOutlined,
  FileDoneOutlined, FileSearchOutlined, PlusSquareOutlined, SwapOutlined, HistoryOutlined,
  BankOutlined as BankIcon, WalletOutlined, ReconciliationOutlined, GoldOutlined,
  PartitionOutlined, DeploymentUnitOutlined, NodeIndexOutlined, IdcardOutlined,
  UsergroupAddOutlined, BellOutlined, SearchOutlined, HomeOutlined, RiseOutlined,
  PercentageOutlined, InboxOutlined as InboxIcon, SnippetsOutlined, CalculatorOutlined,
  CloudServerOutlined, PrinterOutlined, ExportOutlined, ImportOutlined, RightOutlined,
} from '@ant-design/icons';

const ICONS: Record<string, ReactNode> = {
  AppstoreOutlined: <AppstoreOutlined />, DashboardOutlined: <DashboardOutlined />,
  DatabaseOutlined: <DatabaseOutlined />, ShoppingCartOutlined: <ShoppingCartOutlined />,
  ShoppingOutlined: <ShoppingOutlined />, InboxOutlined: <InboxOutlined />,
  BuildOutlined: <BuildOutlined />, BankOutlined: <BankOutlined />, TeamOutlined: <TeamOutlined />,
  ContactsOutlined: <ContactsOutlined />, BarChartOutlined: <BarChartOutlined />,
  SettingOutlined: <SettingOutlined />, FileTextOutlined: <FileTextOutlined />,
  ProfileOutlined: <ProfileOutlined />, AuditOutlined: <AuditOutlined />,
  AccountBookOutlined: <AccountBookOutlined />, MoneyCollectOutlined: <MoneyCollectOutlined />,
  CreditCardOutlined: <CreditCardOutlined />, PayCircleOutlined: <PayCircleOutlined />,
  TransactionOutlined: <TransactionOutlined />, UnorderedListOutlined: <UnorderedListOutlined />,
  TableOutlined: <TableOutlined />, LineChartOutlined: <LineChartOutlined />,
  PieChartOutlined: <PieChartOutlined />, FundOutlined: <FundOutlined />,
  ClusterOutlined: <ClusterOutlined />, ApartmentOutlined: <ApartmentOutlined />,
  UserOutlined: <UserOutlined />, SolutionOutlined: <SolutionOutlined />,
  CalendarOutlined: <CalendarOutlined />, ScheduleOutlined: <ScheduleOutlined />,
  CarryOutOutlined: <CarryOutOutlined />, TagOutlined: <TagOutlined />,
  BarcodeOutlined: <BarcodeOutlined />, ShopOutlined: <ShopOutlined />,
  TruckOutlined: <TruckOutlined />, ToolOutlined: <ToolOutlined />,
  ExperimentOutlined: <ExperimentOutlined />, AlertOutlined: <AlertOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />, FileDoneOutlined: <FileDoneOutlined />,
  FileSearchOutlined: <FileSearchOutlined />, PlusSquareOutlined: <PlusSquareOutlined />,
  SwapOutlined: <SwapOutlined />, HistoryOutlined: <HistoryOutlined />,
  BankIcon: <BankIcon />, WalletOutlined: <WalletOutlined />,
  ReconciliationOutlined: <ReconciliationOutlined />, GoldOutlined: <GoldOutlined />,
  PartitionOutlined: <PartitionOutlined />, DeploymentUnitOutlined: <DeploymentUnitOutlined />,
  NodeIndexOutlined: <NodeIndexOutlined />, IdcardOutlined: <IdcardOutlined />,
  UsergroupAddOutlined: <UsergroupAddOutlined />, BellOutlined: <BellOutlined />,
  SearchOutlined: <SearchOutlined />, HomeOutlined: <HomeOutlined />,
  RiseOutlined: <RiseOutlined />, PercentageOutlined: <PercentageOutlined />,
  InboxIcon: <InboxIcon />, SnippetsOutlined: <SnippetsOutlined />,
  CalculatorOutlined: <CalculatorOutlined />, CloudServerOutlined: <CloudServerOutlined />,
  PrinterOutlined: <PrinterOutlined />, ExportOutlined: <ExportOutlined />,
  ImportOutlined: <ImportOutlined />, RightOutlined: <RightOutlined />,
};

export function menuIcon(name?: string): ReactNode {
  if (!name) return <AppstoreOutlined />;
  return ICONS[name] || <AppstoreOutlined />;
}

export const ICON_NAMES = Object.keys(ICONS);
