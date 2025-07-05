"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage,
  BreadcrumbSeparator
} from "~/components/ui/breadcrumb";
import Link from "next/link";
import { Fragment, useEffect } from "react";
import { useBreadcrumbStore } from "~/lib/store/breadcrumb";
import { usePathname } from "next/navigation";
import Image from "next/image";

function useBreadcrumbs() {
  // const pathname = usePathname();

  const breadcrumbs = [{
    title: "Home",
    url: "/",
  }];

  return breadcrumbs;
}

export default function BreadCrumbs({ commitHash }: { commitHash: string }) {
  const breadcrumbs = useBreadcrumbs();
  const setCommitHash = useBreadcrumbStore((state) => state.setCommitHash);
  const pathname = usePathname();

  useEffect(() => {
    setCommitHash(commitHash);
  }, [commitHash, setCommitHash]);

  return (
    <>
      <Image src={"/logo.png"} alt={"Logo"} width={32} height={32} />
      <Breadcrumb className={"md:flex"} key={"breadcrumbs-root"}>
        <BreadcrumbList key={"breadcrumbs-list"}>
          {breadcrumbs?.map((crumb, index) => (
            <Fragment key={`${crumb.url}-container`}>
              {index > 0 && <BreadcrumbSeparator key={`${crumb.url}-separator`} />}
              <BreadcrumbItem key={`${crumb.url}-item`}>
                {pathname === crumb.url ? (
                  <BreadcrumbPage className={"cursor-default"}>{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink key={`${crumb.url}-link-parent`} asChild>
                    <Link href={crumb.url} key={`${crumb.url}-link`}>{crumb.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}