"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
  PackageCheckIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TruckIcon,
  UploadIcon
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

type ModuleKey =
  | "product"
  | "fulfillment"
  | "orders"
  | "affiliate"
  | "service"
  | "analytics"
  | "system";

type ModuleNav = {
  key: ModuleKey;
  label: string;
  icon: typeof PackageCheckIcon;
  items: Array<{
    label: string;
    href?: string;
    icon: typeof PackageCheckIcon;
    badge?: string;
  }>;
};

const modules: ModuleNav[] = [
  {
    key: "product",
    label: "商品中心",
    icon: PackageCheckIcon,
    items: [
      { label: "商品数字化", href: "/", icon: LayoutDashboardIcon, badge: "Live" },
      { label: "上传", href: "/", icon: UploadIcon },
      { label: "AI识别", href: "/", icon: SparklesIcon },
      { label: "人工校准", href: "/", icon: ClipboardCheckIcon },
      { label: "审核", href: "/control", icon: ShieldCheckIcon },
      { label: "发布", href: "/control", icon: PackageCheckIcon },
      { label: "Barcode", href: "/control", icon: ScanBarcodeIcon }
    ]
  },
  {
    key: "fulfillment",
    label: "仓库履约",
    icon: BoxesIcon,
    items: [
      { label: "拣货任务", icon: BoxesIcon, badge: "PR43+" },
      { label: "打包", icon: PackageCheckIcon },
      { label: "自提/配送", icon: TruckIcon }
    ]
  },
  {
    key: "orders",
    label: "订单中心",
    icon: BriefcaseBusinessIcon,
    items: [
      { label: "订单列表", icon: BriefcaseBusinessIcon, badge: "PR43+" },
      { label: "支付状态", icon: CircleDollarSignIcon }
    ]
  },
  {
    key: "affiliate",
    label: "推广佣金",
    icon: CircleDollarSignIcon,
    items: [
      { label: "推广来源", icon: CircleDollarSignIcon, badge: "Later" },
      { label: "佣金确认", icon: ClipboardCheckIcon }
    ]
  },
  {
    key: "service",
    label: "客户服务",
    icon: HeadphonesIcon,
    items: [
      { label: "售后申请", icon: HeadphonesIcon, badge: "Later" },
      { label: "配送异常", icon: TruckIcon }
    ]
  },
  {
    key: "analytics",
    label: "数据分析",
    icon: BarChart3Icon,
    items: [
      { label: "经营看板", icon: BarChart3Icon, badge: "Later" },
      { label: "商品漏斗", icon: LayoutDashboardIcon }
    ]
  },
  {
    key: "system",
    label: "系统管理",
    icon: SettingsIcon,
    items: [
      { label: "账号角色", icon: ShieldCheckIcon, badge: "PR43" },
      { label: "系统设置", icon: SettingsIcon }
    ]
  }
];

function moduleForPath(pathname: string): ModuleKey {
  if (pathname.startsWith("/control") || pathname.startsWith("/debug") || pathname === "/") return "product";
  return "product";
}

function sectionForPath(pathname: string): string {
  if (pathname.startsWith("/control")) return "商品控制";
  if (pathname.startsWith("/debug")) return "调试工具";
  return "商品数字化";
}

export function OperationsAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeModule = moduleForPath(pathname);
  const [selectedModule, setSelectedModule] = useState<ModuleKey>(routeModule);
  const activeModule = modules.find((module) => module.key === selectedModule) ?? modules[0];
  const routeSection = sectionForPath(pathname);
  const currentItems = activeModule.items;
  const topModules = useMemo(() => modules, []);

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
                {currentItems.map((item) => {
                  const Icon = item.icon;
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
            当前后台框架来自 next-shadcn-admin-dashboard，业务接口保持不变。
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
            <Badge variant="secondary" className="hidden shrink-0 md:inline-flex">
              Staging
            </Badge>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Operations modules">
            {topModules.map((module) => {
              const Icon = module.icon;
              const selected = module.key === selectedModule;
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
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
