"use server"

import {ThemeChooser} from "./ThemeChooser";
import {UserNav} from "./UserNav";
import BreadCrumbs from "./BreadCrumbs";

export default async function HeaderBar() {
  return (
    <header className={"sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4"}>
      <BreadCrumbs commitHash={"tester"} />
      <ThemeChooser />
      <UserNav />
    </header>
  )
}