"use client";

import type { ComponentType, SVGProps } from "react";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Blocks,
  BookKey,
  Building2,
  ChevronRight,
  FileSearch,
  Fingerprint,
  History,
  LoaderCircle,
  Network,
  Search,
  ServerCog,
  ShieldCheck,
  SquareStack,
  Upload,
  UserRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ViewState = "idle" | "loading" | "result";

type NavItem = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type RecentSearch = {
  registryId: string;
  entity: string;
  status: string;
  checkedAt: string;
};

type OwnershipNode = {
  label: string;
  detail: string;
  tone: "high" | "medium" | "low" | "neutral";
  children?: OwnershipNode[];
};

const navigation: NavItem[] = [
  { label: "Search Entity", icon: Search },
  { label: "Batch Upload", icon: Upload },
  { label: "API Keys", icon: BookKey },
  { label: "Audit Logs", icon: History },
];

const recentSearches: RecentSearch[] = [
  {
    registryId: "404852174",
    entity: "NORDIC FORWARDING LLC",
    status: "High Risk",
    checkedAt: "2 min ago",
  },
  {
    registryId: "204559871",
    entity: "GIORGI TRADE SERVICES",
    status: "Low Risk",
    checkedAt: "18 min ago",
  },
  {
    registryId: "302110044",
    entity: "CAUCASUS DRY PORT LTD",
    status: "Medium Risk",
    checkedAt: "42 min ago",
  },
];

const loadingMessages = [
  "Querying Georgian National Registry...",
  "Transliterating UBO data...",
  "Applying Sanctions Logic...",
] as const;

const redFlags = [
  "Post-2022 Registration (Geopolitical Risk Flag)",
  "Corporate Shareholder Detected: Ultimate Beneficial Owner is opaque",
  "Registered address shared with 42 other logistic entities",
];

const ownershipTree: OwnershipNode[] = [
  {
    label: "Nordic Forwarding LLC",
    detail: "Level 1 | Direct registrant",
    tone: "neutral",
    children: [
      {
        label: "Giorgi Kakhidze",
        detail: "Level 2 | 10% | Director",
        tone: "low",
      },
      {
        label: "Gulf Logistics FZE",
        detail: "Level 2 | 90% | Corporate Shareholder - High Risk",
        tone: "high",
        children: [
          {
            label: "Opaque Offshore Entity",
            detail: "Level 3 | Manual Escalation Required",
            tone: "medium",
          },
        ],
      },
    ],
  },
];

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function riskToneClasses(tone: OwnershipNode["tone"]): string {
  if (tone === "high") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (tone === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (tone === "low") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-stone-50 text-slate-700";
}

function statusBadgeClasses(status: string): string {
  if (status.toLowerCase().includes("high")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status.toLowerCase().includes("medium")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function OwnershipBranch({
  nodes,
  depth = 0,
}: {
  nodes: OwnershipNode[];
  depth?: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {nodes.map((node) => (
        <div key={`${node.label}-${node.detail}`} className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-2 size-2 rounded-full",
                node.tone === "high" && "bg-red-500",
                node.tone === "medium" && "bg-amber-500",
                node.tone === "low" && "bg-emerald-500",
                node.tone === "neutral" && "bg-slate-400",
              )}
            />
            <div
              className={cn(
                "flex min-h-20 flex-1 flex-col justify-center rounded-2xl border px-4 py-4 shadow-sm",
                riskToneClasses(node.tone),
                depth > 0 && "bg-white",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold tracking-[0.16em] uppercase text-slate-500">
                    Ownership Node
                  </p>
                  <p className="text-base font-semibold text-slate-900">{node.label}</p>
                </div>
                <Network className="size-4 text-slate-400" />
              </div>
              <p className="mt-2 text-sm">{node.detail}</p>
            </div>
          </div>
          {node.children ? (
            <div className="ml-5 border-l border-dashed border-slate-300 pl-6">
              <OwnershipBranch nodes={node.children} depth={depth + 1} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function GeoSanctDashboard() {
  const [registryId, setRegistryId] = useState("404852174");
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [loadingIndex, setLoadingIndex] = useState(0);

  useEffect(() => {
    if (viewState !== "loading") {
      setLoadingIndex(0);
      return;
    }

    const messageInterval = window.setInterval(() => {
      setLoadingIndex((current) =>
        current < loadingMessages.length - 1 ? current + 1 : current,
      );
    }, 650);

    const completionTimer = window.setTimeout(() => {
      setViewState("result");
    }, 2000);

    return () => {
      window.clearInterval(messageInterval);
      window.clearTimeout(completionTimer);
    };
  }, [viewState]);

  const runComplianceCheck = () => {
    setViewState("loading");
  };

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r border-stone-200 bg-stone-50/90">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-stone-200 px-6 py-6">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-slate-300 bg-slate-950 text-stone-50 shadow-sm">
                <SquareStack className="size-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium tracking-[0.28em] uppercase text-slate-500">
                  Middle Corridor
                </span>
                <span className="text-lg font-semibold tracking-tight text-slate-950">
                  GeoSanct API
                </span>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-8 px-4 py-6">
                <div className="flex flex-col gap-2">
                  {navigation.map((item, index) => {
                    const Icon = item.icon;
                    const isActive = index === 0;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        className={cn(
                          "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors",
                          isActive
                            ? "border-slate-300 bg-slate-950 text-stone-50 shadow-sm"
                            : "border-transparent bg-transparent text-slate-600 hover:border-stone-200 hover:bg-white hover:text-slate-950",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="size-4" />
                          <span className="text-sm font-medium">{item.label}</span>
                        </span>
                        <ChevronRight className="size-4 opacity-60" />
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-3xl border border-stone-200 bg-white px-5 py-5 shadow-sm">
                  <p className="text-xs font-medium tracking-[0.28em] uppercase text-slate-500">
                    Trust Boundary
                  </p>
                  <div className="mt-4 flex items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                      <ShieldCheck className="size-5" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-slate-900">
                        API ingress protected
                      </p>
                      <p className="text-sm leading-6 text-slate-600">
                        Signed requests, audit trails, and sanctions logic are active
                        across every lookup.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </aside>

        <main className="flex min-h-screen flex-col">
          <header className="border-b border-stone-200 bg-stone-50/80 px-6 py-5 backdrop-blur">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Workspace</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Compliance</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Search Entity</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex items-center gap-3 self-start xl:self-auto">
                <div className="flex items-center gap-3 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  System Status: Operational
                </div>
                <Avatar className="size-10 border border-stone-200 bg-slate-950 text-stone-50">
                  <AvatarFallback>CO</AvatarFallback>
                </Avatar>
                <div className="hidden flex-col xl:flex">
                  <span className="text-sm font-semibold text-slate-900">
                    Compliance Officer
                  </span>
                  <span className="text-xs tracking-[0.18em] uppercase text-slate-500">
                    Tier 1
                  </span>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 px-6 py-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
              <section
                className={cn(
                  "rounded-[2rem] border border-stone-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.08),_transparent_36%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(250,250,249,0.96))] p-6 shadow-sm md:p-8",
                  viewState === "idle" && "min-h-[320px] justify-center",
                )}
              >
                <div
                  className={cn(
                    "flex flex-col gap-8",
                    viewState === "idle" && "items-center text-center",
                  )}
                >
                  <div className="flex max-w-3xl flex-col gap-4">
                    <div className="flex items-center gap-3 self-start rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-xs font-medium tracking-[0.24em] uppercase text-slate-500">
                      <Fingerprint className="size-4 text-slate-500" />
                      Automated sanctions and due diligence workflow
                    </div>
                    <div className="flex flex-col gap-3">
                      <h1 className="text-balance text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                        Search Georgian registry records and score ownership risk in
                        one pass.
                      </h1>
                      <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                        GeoSanct API correlates registry extracts, transliterated
                        UBO structures, and sanctions heuristics for Middle Corridor
                        counterparties.
                      </p>
                    </div>
                  </div>

                  <div className="grid w-full max-w-4xl gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={registryId}
                        onChange={(event) => setRegistryId(event.target.value)}
                        placeholder="Enter Georgian Registry ID (e.g., 404852174)"
                        className="h-14 rounded-2xl border-stone-300 bg-white pl-11 text-base shadow-sm placeholder:text-slate-400"
                      />
                    </div>
                    <Button
                      onClick={runComplianceCheck}
                      className="h-14 rounded-2xl bg-slate-950 text-stone-50 shadow-sm hover:bg-slate-800"
                    >
                      <FileSearch data-icon="inline-start" />
                      Run Compliance Check
                    </Button>
                  </div>

                  <div className="grid gap-3 text-left md:grid-cols-3">
                    <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                      <p className="text-xs font-medium tracking-[0.24em] uppercase text-slate-500">
                        API Throughput
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                        1.8s
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Median time from registry query to risk response.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                      <p className="text-xs font-medium tracking-[0.24em] uppercase text-slate-500">
                        Transliteration Layer
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                        EU-ready
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Cross-lingual entity normalization for sanctions screening.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                      <p className="text-xs font-medium tracking-[0.24em] uppercase text-slate-500">
                        Manual Review Rate
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                        12.4%
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Escalations kept narrow through ownership-aware heuristics.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {viewState === "idle" ? (
                <Card className="rounded-[2rem] border-stone-200 bg-white shadow-sm">
                  <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-2">
                      <CardTitle className="text-xl tracking-tight text-slate-950">
                        Recent Searches
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-600">
                        Last verified Georgian counterparties processed through the
                        due diligence engine.
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className="w-fit rounded-full border-stone-300 bg-stone-50 px-3 py-1 text-slate-600"
                    >
                      3 Results Cached
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-stone-200">
                          <TableHead>Registry ID</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Checked</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentSearches.map((item) => (
                          <TableRow key={item.registryId} className="border-stone-200">
                            <TableCell className="font-medium text-slate-950">
                              {item.registryId}
                            </TableCell>
                            <TableCell>{item.entity}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full px-3 py-1",
                                  statusBadgeClasses(item.status),
                                )}
                              >
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-slate-500">
                              {item.checkedAt}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : null}

              {viewState === "loading" ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
                  <Card className="rounded-[2rem] border-stone-200 bg-white shadow-sm">
                    <CardContent className="flex min-h-[420px] flex-col justify-center gap-8 p-8">
                      <div className="flex items-center gap-4">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-950 text-stone-50">
                          <LoaderCircle className="size-6 animate-spin" />
                        </div>
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-medium tracking-[0.28em] uppercase text-slate-500">
                            Compliance Workflow
                          </p>
                          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                            {loadingMessages[loadingIndex]}
                          </h2>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        {loadingMessages.map((step, index) => (
                          <div
                            key={step}
                            className={cn(
                              "rounded-2xl border px-4 py-4 transition-colors",
                              index <= loadingIndex
                                ? "border-slate-300 bg-slate-950 text-stone-50"
                                : "border-stone-200 bg-stone-50 text-slate-500",
                            )}
                          >
                            <p className="text-xs font-medium tracking-[0.22em] uppercase">
                              Step {index + 1}
                            </p>
                            <p className="mt-3 text-sm leading-6">{step}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[2rem] border-stone-200 bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-xl tracking-tight text-slate-950">
                        Processing Feed
                      </CardTitle>
                      <CardDescription>
                        Registry metadata and ownership nodes hydrate in sequence.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <Skeleton className="h-24 rounded-2xl bg-stone-200" />
                      <Skeleton className="h-32 rounded-2xl bg-stone-200" />
                      <Skeleton className="h-20 rounded-2xl bg-stone-200" />
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {viewState === "result" ? (
                <div className="grid gap-6">
                  <Card className="overflow-hidden rounded-[2rem] border-stone-200 bg-white shadow-sm">
                    <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                      <CardContent className="flex flex-col gap-8 p-8">
                        <div className="flex flex-col gap-3">
                          <p className="text-xs font-medium tracking-[0.3em] uppercase text-slate-500">
                            Due Diligence Report
                          </p>
                          <div className="flex flex-col gap-3">
                            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                              NORDIC FORWARDING LLC
                            </h2>
                            <p className="text-lg text-slate-600">
                              ნორდიკ ფორვარდინგ შპს
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                          <Badge
                            variant="outline"
                            className="rounded-full border-stone-300 bg-stone-50 px-3 py-1 text-slate-700"
                          >
                            Registry ID: 404852174
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-full border-stone-300 bg-stone-50 px-3 py-1 text-slate-700"
                          >
                            Date: 24-Mar-2023
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-full border-stone-300 bg-stone-50 px-3 py-1 text-slate-700"
                          >
                            Corridor: Georgia
                          </Badge>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-5">
                            <p className="text-xs font-medium tracking-[0.24em] uppercase text-slate-500">
                              Ownership Transparency
                            </p>
                            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                              18/100
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Control chain breaks at a corporate node with offshore
                              opacity.
                            </p>
                          </div>
                          <div className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-5">
                            <p className="text-xs font-medium tracking-[0.24em] uppercase text-slate-500">
                              Address Reuse
                            </p>
                            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                              42 Entities
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Shared logistics address linked to elevated screening
                              frequency.
                            </p>
                          </div>
                          <div className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-5">
                            <p className="text-xs font-medium tracking-[0.24em] uppercase text-slate-500">
                              Analyst Action
                            </p>
                            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                              Escalate
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              UBO chain requires manual corroboration before clearance.
                            </p>
                          </div>
                        </div>
                      </CardContent>

                      <div className="border-t border-stone-200 bg-slate-950 p-8 text-stone-50 xl:border-l xl:border-t-0">
                        <div className="flex h-full flex-col justify-between gap-8">
                          <div className="flex flex-col gap-4">
                            <p className="text-xs font-medium tracking-[0.3em] uppercase text-slate-300">
                              Sanctions Score
                            </p>
                            <div className="rounded-[1.75rem] border border-red-200 bg-red-50 p-6 text-red-700">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex flex-col gap-3">
                                  <span className="text-sm font-semibold tracking-[0.22em] uppercase">
                                    Score: 85/100
                                  </span>
                                  <span className="text-3xl font-semibold tracking-tight">
                                    High Risk
                                  </span>
                                </div>
                                <AlertTriangle className="size-8 shrink-0" />
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-3">
                            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-4">
                              <div className="flex items-center gap-3">
                                <ServerCog className="size-4 text-emerald-300" />
                                <span className="text-sm text-slate-200">
                                  Registry sync completed successfully
                                </span>
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-4">
                              <div className="flex items-center gap-3">
                                <BadgeCheck className="size-4 text-amber-300" />
                                <span className="text-sm text-slate-200">
                                  Ownership graph confidence reduced by opaque parent
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <Card className="rounded-[2rem] border-stone-200 bg-white shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-xl tracking-tight text-slate-950">
                          Automated Red Flags
                        </CardTitle>
                        <CardDescription>
                          Deterministic controls triggered during the current review.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        {redFlags.map((flag) => (
                          <div
                            key={flag}
                            className="flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4"
                          >
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-red-700 shadow-sm">
                              <AlertTriangle className="size-5" />
                            </div>
                            <div className="flex flex-col gap-2">
                              <p className="text-sm font-semibold text-red-700">Flag Raised</p>
                              <p className="text-sm leading-6 text-red-700">{flag}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="rounded-[2rem] border-stone-200 bg-white shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-xl tracking-tight text-slate-950">
                          UBO Structure
                        </CardTitle>
                        <CardDescription>
                          Ownership hierarchy derived from transliterated registry data.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <OwnershipBranch nodes={ownershipTree} />
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="rounded-[2rem] border-stone-200 bg-white shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-lg tracking-tight text-slate-950">
                          Entity Profile
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4 text-sm text-slate-600">
                        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-4">
                          <Building2 className="size-4 text-slate-500" />
                          <div>
                            <p className="font-medium text-slate-950">Industry</p>
                            <p>Freight forwarding and corridor logistics</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-4">
                          <Blocks className="size-4 text-slate-500" />
                          <div>
                            <p className="font-medium text-slate-950">Jurisdiction</p>
                            <p>Tbilisi registration with foreign corporate parent</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-4">
                          <UserRound className="size-4 text-slate-500" />
                          <div>
                            <p className="font-medium text-slate-950">Review Queue</p>
                            <p>Escalated to Enhanced Due Diligence lane</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-[2rem] border-stone-200 bg-white shadow-sm lg:col-span-2">
                      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col gap-2">
                          <CardTitle className="text-lg tracking-tight text-slate-950">
                            Analyst Next Actions
                          </CardTitle>
                          <CardDescription>
                            Recommended follow-up before any downstream onboarding or
                            settlement workflow.
                          </CardDescription>
                        </div>
                        <Button className="rounded-full bg-slate-950 text-stone-50 hover:bg-slate-800">
                          Open Escalation Case
                          <ArrowRight data-icon="inline-end" />
                        </Button>
                      </CardHeader>
                      <CardContent className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-700">
                          <p className="text-xs font-medium tracking-[0.22em] uppercase">
                            Step 1
                          </p>
                          <p className="mt-3 text-sm leading-6">
                            Request beneficial ownership corroboration for Gulf
                            Logistics FZE.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-slate-700">
                          <p className="text-xs font-medium tracking-[0.22em] uppercase">
                            Step 2
                          </p>
                          <p className="mt-3 text-sm leading-6">
                            Cross-screen the shared address cluster against adverse
                            media and watchlists.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-700">
                          <p className="text-xs font-medium tracking-[0.22em] uppercase">
                            Step 3
                          </p>
                          <p className="mt-3 text-sm leading-6">
                            Approve only after manual analyst sign-off and source
                            document retention.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : null}

              <Separator className="bg-stone-200" />

              <footer className="flex flex-col gap-3 pb-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
                <p>GeoSanct API workspace tuned for Georgian entity due diligence.</p>
                <p>Registry, transliteration, and sanctions graph updates are auditable.</p>
              </footer>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
