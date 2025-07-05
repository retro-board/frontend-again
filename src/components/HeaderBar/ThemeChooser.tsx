"use client"

import {useTheme} from "next-themes";
import {MonitorCog, Moon, Sun, SunMoonIcon} from "lucide-react";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "~/components/ui/dropdown-menu";

export function ThemeChooser() {
  const {setTheme} = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={"cursor-pointer"} asChild>
        <SunMoonIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={"end"}>
        <DropdownMenuItem className={"cursor-pointer p-2"} onClick={() => setTheme("light")}>
          <Sun />&nbsp;Light
        </DropdownMenuItem>
        <DropdownMenuItem className={"cursor-pointer"} onClick={() => setTheme("dark")}>
          <Moon />&nbsp;Dark
        </DropdownMenuItem>
        <DropdownMenuItem className={"cursor-pointer"} onClick={() => setTheme("system")}>
          <MonitorCog />&nbsp;System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}