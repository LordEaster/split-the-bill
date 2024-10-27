"use client";

import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Friend, OrderItem, DebtCalculation } from "../types";
import { FriendsList } from "../components/FriendsList";
import { OrdersList } from "../components/OrdersList";
import { Summary } from "../components/Summary";
import { ShareButton } from "../components/ShareButton";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function Home() {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const router = useRouter();

    // Load data on the first render
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        let sessionIdFromUrl = searchParams.get("sessionId");
    
        if (!sessionIdFromUrl) {
            // Generate new sessionId if one does not exist
            sessionIdFromUrl = crypto.randomUUID();
            router.replace(`/?sessionId=${sessionIdFromUrl}`, undefined);
        }
    
        setSessionId(sessionIdFromUrl);

    }, [router]);

    // Fetch data for the session ID only if it's defined
    useEffect(() => {
        if (!sessionId) return;

        fetch(`${API_BASE_URL}/sessions/${sessionId}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.friends) setFriends(data.friends);
                if (data.orders) setOrders(data.orders);
                toast.success("Session data loaded successfully!");
            })
            .catch((error) => {
                toast.error("Failed to load session data");
                console.error("Failed to load session data", error);
            });
    }, [sessionId]);

    // Sync state changes with the backend
    useEffect(() => {
        if (!sessionId) return;

        fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ friends, orders }),
        }).catch((error) => {
            console.error("Failed to update session data", error);
        });
    }, [friends, orders, sessionId]);

    // Friend and order management functions
    const addFriend = (name: string, paymentAddress?: string) => {
        setFriends([
            ...friends,
            { id: crypto.randomUUID(), name, paid: false, paymentAddress },
        ]);
    };

    const updatePaymentAddress = (id: string, address: string) => {
        setFriends(
            friends.map((friend) =>
                friend.id === id ? { ...friend, paymentAddress: address } : friend
            )
        );
    };

    const addOrder = (description: string, amount: number, paidBy: string) => {
        setOrders([
            ...orders,
            {
                id: crypto.randomUUID(),
                description,
                amount,
                paidBy,
                assignedTo: [],
            },
        ]);
    };

    const toggleFriendAssignment = (orderId: string, friendId: string) => {
        setOrders(
            orders.map((order) => {
                if (order.id === orderId) {
                    const newAssignedTo = order.assignedTo.includes(friendId)
                        ? order.assignedTo.filter((id) => id !== friendId)
                        : [...order.assignedTo, friendId];
                    return { ...order, assignedTo: newAssignedTo };
                }
                return order;
            })
        );
    };

    const togglePaid = (friendId: string) => {
        setFriends(
            friends.map((friend) =>
                friend.id === friendId ? { ...friend, paid: !friend.paid } : friend
            )
        );
    };

    const calculateShare = (friendId: string) => {
        let totalOwed = 0;
        let totalPaid = 0;

        orders.forEach((order) => {
            if (order.assignedTo.includes(friendId)) {
                totalOwed += order.amount / order.assignedTo.length;
            }
            if (order.paidBy === friendId) {
                totalPaid += order.amount;
            }
        });

        return totalOwed - totalPaid;
    };

    const calculateDebts = (): DebtCalculation[] => {
        const balances = new Map<string, number>();

        friends.forEach((friend) => {
            balances.set(friend.id, -calculateShare(friend.id));
        });

        const debts: DebtCalculation[] = [];
        const debtors = Array.from(balances.entries())
            .filter(([_, balance]) => balance < 0)
            .sort((a, b) => a[1] - b[1]);
        const creditors = Array.from(balances.entries())
            .filter(([_, balance]) => balance > 0)
            .sort((a, b) => b[1] - a[1]);

        let i = 0;
        let j = 0;

        while (i < debtors.length && j < creditors.length) {
            const [debtorId, debtorBalance] = debtors[i];
            const [creditorId, creditorBalance] = creditors[j];

            const amount = Math.min(-debtorBalance, creditorBalance);

            if (amount > 0.01) {
                debts.push({
                    from: debtorId,
                    to: creditorId,
                    amount,
                });
            }

            if (-debtorBalance > creditorBalance) {
                debtors[i][1] += creditorBalance;
                j++;
            } else if (-debtorBalance < creditorBalance) {
                creditors[j][1] += debtorBalance;
                i++;
            } else {
                i++;
                j++;
            }
        }

        return debts;
    };

    const deleteOrder = (orderId: string) => {
        setOrders(orders.filter((order) => order.id !== orderId));
    };

    const deleteFriend = (friendId: string) => {
        setFriends(friends.filter((friend) => friend.id !== friendId));
        setOrders(
            orders.map((order) => ({
                ...order,
                assignedTo: order.assignedTo.filter((id) => id !== friendId),
            }))
        );
    };

    return (
        <main className="min-h-screen bg-gradient-to-b from-background to-muted p-6">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-2">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-4xl font-bold">Share Bill</h1>
                        <ShareButton sessionId={sessionId ?? ''} />
                    </div>
                    <p className="text-muted-foreground">
                        Easy bill sharing with friends
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <FriendsList
                        friends={friends}
                        onAddFriend={addFriend}
                        onDeleteFriend={deleteFriend}
                        onTogglePaid={togglePaid}
                        onUpdatePaymentAddress={updatePaymentAddress}
                        calculateShare={calculateShare}
                    />

                    <OrdersList
                        orders={orders}
                        friends={friends}
                        onAddOrder={addOrder}
                        onDeleteOrder={deleteOrder}
                        onToggleFriendAssignment={toggleFriendAssignment}
                    />

                    <Summary
                        friends={friends}
                        debts={calculateDebts()}
                        calculateShare={calculateShare}
                    />
                </div>
            </div>
        </main>
    );
}