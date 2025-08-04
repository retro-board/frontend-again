import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

export function useUserSync() {
  const { user, isLoaded } = useUser();

  const { data, error } = useQuery({
    queryKey: ["user-sync", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const response = await fetch("/api/users/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.emailAddresses[0]?.emailAddress ?? "",
          name: user.fullName ?? user.username ?? "",
          avatar_url: user.imageUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to sync user");
      }

      return response.json();
    },
    enabled: !!user && isLoaded,
    staleTime: Infinity, // User data doesn't change often
  });

  return { syncedUser: data?.user, syncError: error };
}