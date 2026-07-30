"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3Icon,
  BoxesIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  ClipboardCheckIcon,
  HeadphonesIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PackageCheckIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TruckIcon,
  UploadIcon,
  UserCogIcon,
  UsersIcon,
  XCircleIcon
} from "lucide-react";

import {
  adminInitials,
  canAccessPath,
  filterNavigation,
  roleLabels,
  type NavigationItem,
  type NavigationModule
} from "@/components/admin/operations-access";
import { DEFAULT_ADMIN_LOGIN, useOperationsSession } from "@/components/admin/operations-access-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type ModuleKey = "product" | "warehouse" | "orders" | "affiliate" | "service" | "analytics" | "system";

type ModuleItem = NavigationItem & {
  icon: typeof PackageCheckIcon;
};

type ModuleNav = NavigationModule & {
  key: ModuleKey;
  icon: typeof PackageCheckIcon;
  items: ModuleItem[];
};

export const operationsModules: ModuleNav[] = [
  {
    key: "product",
    label: "商品中心",
    icon: PackageCheckIcon,
    permission: "module.product",
    items: [
      { label: "商品工作台", href: "/", icon: LayoutDashboardIcon, permission: "page.product.digitalization", badge: "Live" },
      { label: "新建批次", href: "/product/new-batch", icon: PackageCheckIcon, permission: "page.product.digitalization" },
      { label: "待上传", href: "/product/waiting-upload", icon: UploadIcon, permission: "page.product.digitalization" },
      { label: "待 AI 识别", href: "/product/waiting-ai", icon: SparklesIcon, permission: "page.product.digitalization" },
      { label: "待人工校准", href: "/product/calibration", icon: ClipboardCheckIcon, permission: "page.product.digitalization" },
      { label: "待审核", href: "/product/review", icon: ShieldCheckIcon, permission: "page.product.control" },
      { label: "已发布", href: "/product/published", icon: PackageCheckIcon, permission: "page.product.control" },
      { label: "已拒绝", href: "/product/rejected", icon: XCircleIcon, permission: "page.product.control" },
      { label: "Barcode", href: "/product/barcode", icon: ScanBarcodeIcon, permission: "page.product.control" },
      { label: "分类与属性", href: "/product/taxonomy", icon: SettingsIcon, permission: "page.product.control" }
    ]
  },
  {
    key: "warehouse",
    label: "仓库履约",
    icon: BoxesIcon,
    permission: "module.warehouse",
    items: [
      { label: "拣货任务", icon: BoxesIcon, permission: "action.warehouse.view", badge: "PR44+" },
      { label: "打包", icon: PackageCheckIcon, permission: "action.warehouse.view" },
      { label: "自提/配送", icon: TruckIcon, permission: "action.warehouse.view" }
    ]
  },
  {
    key: "orders",
    label: "订单中心",
    icon: BriefcaseBusinessIcon,
    permission: "module.orders",
    items: [
      { label: "订单列表", icon: BriefcaseBusinessIcon, permission: "action.orders.view", badge: "PR44+" },
      { label: "支付状态", icon: CircleDollarSignIcon, permission: "action.orders.view" }
    ]
  },
  {
    key: "affiliate",
    label: "推广佣金",
    icon: CircleDollarSignIcon,
    permission: "module.affiliate",
    items: [
      { label: "推广来源", icon: CircleDollarSignIcon, permission: "action.affiliate.view", badge: "Later" },
      { label: "佣金确认", icon: ClipboardCheckIcon, permission: "action.affiliate.view" }
    ]
  },
  {
    key: "service",
    label: "客户服务",
    icon: HeadphonesIcon,
    permission: "module.customer-service",
    items: [
      { label: "售后申请", icon: HeadphonesIcon, permission: "action.customer-service.view", badge: "Later" },
      { label: "配送异常", icon: TruckIcon, permission: "action.customer-service.view" }
    ]
  },
  {
    key: "analytics",
    label: "数据分析",
    icon: BarChart3Icon,
    permission: "module.analytics",
    items: [
      { label: "经营看板", icon: BarChart3Icon, permission: "action.analytics.view", badge: "Later" },
      { label: "商品漏斗", icon: LayoutDashboardIcon, permission: "action.analytics.view" }
    ]
  },
  {
    key: "system",
    label: "系统管理",
    icon: SettingsIcon,
    permission: "module.system",
    items: [
      { label: "账号管理", href: "/system/accounts", icon: UsersIcon, permission: "page.system.accounts" },
      { label: "角色管理", href: "/system/roles", icon: UserCogIcon, permission: "page.system.roles" },
      { label: "权限管理", href: "/system/permissions", icon: ShieldCheckIcon, permission: "page.system.permissions" }
    ]
  }
];

function moduleForPath(pathname: string): ModuleKey {
  if (pathname.startsWith("/system")) return "system";
  if (pathname.startsWith("/product") || pathname.startsWith("/control") || pathname.startsWith("/debug") || pathname === "/") return "product";
  return "product";
}

function sectionForPath(pathname: string): string {
  if (pathname.startsWith("/control")) return "商品控制";
  if (pathname.startsWith("/debug")) return "调试工具";
  if (pathname.startsWith("/product/new-batch")) return "新建批次";
  if (pathname.startsWith("/product/waiting-upload")) return "待上传";
  if (pathname.startsWith("/product/waiting-ai")) return "待 AI 识别";
  if (pathname.startsWith("/product/calibration")) return "待人工校准";
  if (pathname.startsWith("/product/review")) return "待审核";
  if (pathname.startsWith("/product/published")) return "已发布";
  if (pathname.startsWith("/product/rejected")) return "已拒绝";
  if (pathname.startsWith("/product/barcode")) return "Barcode";
  if (pathname.startsWith("/product/taxonomy")) return "分类与属性";
  if (pathname.startsWith("/system/roles")) return "角色管理";
  if (pathname.startsWith("/system/permissions")) return "权限管理";
  if (pathname.startsWith("/system/accounts")) return "账号管理";
  return "商品数字化";
}

export function OperationsAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading, session, logout } = useOperationsSession();
  const visibleModules = useMemo(() => filterNavigation(operationsModules, session) as ModuleNav[], [session]);
  const routeModule = moduleForPath(pathname);
  const [selectedModule, setSelectedModule] = useState<ModuleKey>(routeModule);

  useEffect(() => {
    setSelectedModule(routeModule);
  }, [routeModule]);

  if (loading) return <LoadingScreen />;
  if (!session?.adminUser) return <LoginScreen />;

  const routeAllowed = canAccessPath(pathname, operationsModules, session);
  const fallbackModule: ModuleNav = visibleModules[0] ?? operationsModules[0];
  const activeModule: ModuleNav = visibleModules.find((module) => module.key === selectedModule) ?? fallbackModule;
  const routeSection = sectionForPath(pathname);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "17rem"
        } as CSSProperties
      }
    >
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2Icon data-icon="inline-start" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-medium text-sm">Online Saler</p>
              <p className="truncate text-muted-foreground text-xs">Operations</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{activeModule.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {activeModule.items.map((item) => {
                  const Icon = item.icon ?? PackageCheckIcon;
                  const isActive = Boolean(item.href && item.href === pathname);
                  const content = (
                    <>
                      <Icon />
                      <span>{item.label}</span>
                    </>
                  );

                  return (
                    <SidebarMenuItem key={`${activeModule.key}-${item.label}`}>
                      {item.href ? (
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link href={item.href}>{content}</Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton type="button" aria-disabled="true" className="opacity-60" tooltip={item.label}>
                          {content}
                        </SidebarMenuButton>
                      )}
                      {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="rounded-lg border bg-background p-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            后台账号、角色和权限由系统管理统一控制。
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-clip [--operations-header-height:--spacing(13)]">
        <header className="sticky top-0 z-20 flex min-h-13 shrink-0 flex-col gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/">Operations</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator>
                    <ChevronRightIcon />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{activeModule.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator>
                    <ChevronRightIcon />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{routeSection}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className="hidden md:inline-flex">
                Staging
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 px-2">
                    <Avatar className="size-7">
                      <AvatarFallback>{adminInitials(session.adminUser)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-36 truncate md:inline">{session.adminUser.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    <div className="flex flex-col gap-1">
                      <span>{session.adminUser.name}</span>
                      <span className="font-normal text-muted-foreground text-xs">{roleLabels(session)}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOutIcon />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Operations modules">
            {visibleModules.map((module) => {
              const Icon = module.icon;
              const selected = module.key === activeModule.key;
              return (
                <Button
                  key={module.key}
                  type="button"
                  variant={selected ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("shrink-0", selected && "shadow-xs")}
                  onClick={() => setSelectedModule(module.key)}
                >
                  <Icon data-icon="inline-start" />
                  {module.label}
                </Button>
              );
            })}
          </nav>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">
          {routeAllowed ? children : <AccessDenied />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>正在打开后台</CardTitle>
          <CardDescription>正在读取账号权限。</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function LoginScreen() {
  const { login, error } = useOperationsSession();
  const [loginAccount, setLoginAccount] = useState(DEFAULT_ADMIN_LOGIN);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit() {
    setBusy(true);
    setLocalError("");
    try {
      await login(loginAccount, password);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>后台登录</CardTitle>
          <CardDescription>使用后台账号登录。顾客 Google 登录不适用于这里。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="admin-login">登录账号或邮箱</Label>
            <Input id="admin-login" value={loginAccount} onChange={(event) => setLoginAccount(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-password">密码</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              placeholder="Staging 初始密码为 ChangeMe43!"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
          </div>
          {localError || error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
              {localError || error}
            </div>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? "正在登录..." : "登录"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function AccessDenied() {
  return (
    <Card className="mx-auto mt-12 max-w-lg">
      <CardHeader>
        <CardTitle>403 无权限访问</CardTitle>
        <CardDescription>当前后台账号没有访问这个页面的权限。</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        请联系 Super Admin 调整角色或权限。
      </CardContent>
    </Card>
  );
}
