import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ArrowRight, Users, Zap, MessageSquare, Vote } from "lucide-react";

export default function HomePage() {
	return (
		<main className="flex min-h-screen flex-col">
			<section className="flex-1 flex items-center justify-center bg-gradient-to-b from-background to-muted px-4 py-16">
				<div className="container max-w-6xl">
					<div className="text-center mb-12">
						<h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl mb-4">
							Retro Board & Sprint Poker
						</h1>
						<p className="text-xl text-muted-foreground mb-8">
							Facilitate better retrospectives and sprint planning with your team
						</p>
						<div className="flex gap-4 justify-center">
							<Link href="/boards">
								<Button size="lg">
									Start Retro Board
									<ArrowRight className="ml-2 h-4 w-4" />
								</Button>
							</Link>
							<Link href="/poker">
								<Button size="lg" variant="outline">
									Sprint Poker
									<Vote className="ml-2 h-4 w-4" />
								</Button>
							</Link>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<MessageSquare className="h-6 w-6" />
									Retro Boards
								</CardTitle>
								<CardDescription>
									Run effective retrospectives with your team
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="space-y-2">
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Create dynamic columns for any retrospective format</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Add, edit, and organize cards in real-time</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Vote on important topics to prioritize discussions</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Collaborate with your team seamlessly</span>
									</li>
								</ul>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Zap className="h-6 w-6" />
									Sprint Poker
								</CardTitle>
								<CardDescription>
									Estimate story points efficiently with your team
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="space-y-2">
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Choose from Fibonacci, T-shirt sizes, or 1-10 scales</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Vote privately and reveal simultaneously</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Track estimation history for better planning</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-primary">•</span>
										<span>Facilitate discussions on divergent estimates</span>
									</li>
								</ul>
							</CardContent>
						</Card>
					</div>

					<div className="text-center mt-16">
						<h2 className="text-3xl font-bold mb-4">Built for Remote Teams</h2>
						<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
							Whether your team is distributed across the globe or working from the same office,
							our tools help you run effective agile ceremonies that drive continuous improvement.
						</p>
					</div>
				</div>
			</section>
		</main>
	);
}