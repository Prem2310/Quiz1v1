import { useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { getListCollegesQueryKey, useListColleges } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

/**
 * Choose your college from the shared list. If it isn't there, "My college isn't listed" lets you type it; the API
 * adds it to the list when the profile is saved, so the next student finds it.
 */
export function CollegePicker({ id, value, onChange }: { id?: string; value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false); // the "Other" step: a plain text box for a college that isn't listed
  const [custom, setCustom] = useState("");
  const [isNew, setIsNew] = useState(false);

  const q = useDebouncedValue(query, 200);
  const { data: colleges = [], isFetching } = useListColleges({ q }, { query: { queryKey: getListCollegesQueryKey({ q }), staleTime: 60_000 } });

  function choose(name: string, added = false) {
    onChange(name);
    setIsNew(added);
    setOpen(false);
  }

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setTyping(false);
      setCustom("");
    }
  }

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={reset}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Select your college"}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          {typing ? (
            <form
              className="space-y-3 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (custom.trim().length >= 3) choose(custom.trim(), true);
              }}
            >
              <p className="text-sm text-muted-foreground">Type your college's full name. It will be added to the list when you save.</p>
              <Input autoFocus aria-label="Your college's full name" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={180} placeholder="e.g. Sunrise Institute of Technology, Jaipur" />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setTyping(false)}>
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={custom.trim().length < 3}>
                  Use this college
                </Button>
              </div>
            </form>
          ) : (
            <Command shouldFilter={false}>
              <CommandInput placeholder="Search colleges" value={query} onValueChange={setQuery} />
              <CommandList>
                <CommandEmpty>{isFetching ? "Searching…" : "No matches. Try a shorter search, or add yours below."}</CommandEmpty>
                <CommandGroup>
                  {colleges.map((college) => (
                    <CommandItem key={college.id} value={String(college.id)} onSelect={() => choose(college.name)}>
                      <Check className={cn("mr-2 h-4 w-4", value === college.name ? "opacity-100" : "opacity-0")} />
                      {college.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup>
                  {value ? (
                    <CommandItem value="none" onSelect={() => choose("")}>
                      <X className="mr-2 h-4 w-4" /> No college
                    </CommandItem>
                  ) : null}
                  <CommandItem
                    value="other"
                    onSelect={() => {
                      setCustom(query.trim());
                      setTyping(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> My college isn't listed
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
      {isNew && value ? <p className="text-xs text-muted-foreground">Not on the list yet: it will be added when you save.</p> : null}
    </div>
  );
}
