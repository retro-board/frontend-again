"use server"

import {ThemeChooser} from "./ThemeChooser";
import {UserNav} from "./UserNav";
import BreadCrumbs from "./BreadCrumbs";

export default async function HeaderBar() {
  return (
    <header className={"sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-4"}>
      <BreadCrumbs commitHash={"tester"} />
      <div className={"relative ml-auto flex-1 md:grow-0"}>&nbsp;</div>
      <ThemeChooser />
      <UserNav />
    </header>
  )
}