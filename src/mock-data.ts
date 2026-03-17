import type { UIMessage } from 'ai';

export const mockMessages: UIMessage[] = [
	{
		id: "1",
		role: "user",
		parts: [
			{
				type: "text",
				text: "Generate a playlist please",
				state: "done",
			}
		]
	},
	{
		id: "2",
		role: "assistant",
		parts: [
			{
				type: "step-start"
			},
			{
				type: "reasoning",
				text: "The user wishes I generate a playlist. I need to ask for the genre.",
				state: "done",
			},
			{
				type: "text",
				text: "What genre?",
				state: "done",
			}
		]
	},
	{
		id: "3",
		role: "user",
		parts: [
			{
				type: "text",
				text: "Lofi",
				state: "done",
			}
		]
	},
	{
		id: "4",
		role: "assistant",
		parts: [
			{
				type: "step-start",
			},
			{
				type: "tool-generatePlaylist",
				toolCallId: "tool-call-1",
				state: "output-available",
				input: {
					genre: "Lofi",
				},
				output: [
					{
						title: "Snowman",
						artists: ["WYS", "Lofi Girl"],
						link: "https://open.spotify.com/track/5oKzIi5OFGRD8f2oGaHLtj?si=dc2a8a806eee4d13",
					},
					{
						title: "1 A.m Study Session - Lofi 3 - Instrumental",
						artists: ["ChilledCow"],
						link: "https://open.spotify.com/track/5RsqdxiSEx3xkBOV8VZwnH?si=6e430280667b462a",
					},
					{
						title: "Night Walk",
						artists: ["Nymano", "Saib"],
						link: "https://open.spotify.com/track/12Q21aqqo0oggpqlkP0nOt?si=9bae030521a44a85",
					}
				],
			},
			{
				type: "text",
				text: "Here's a lofi playlist for you! Snowman by WYS, Lofi Study by ChilledCow and Night Walk by Saib.",
				state: "done",
			},
		]
	},
	{
		id: "5",
		role: "user",
		parts: [
			{
				type: "text",
				text: "Can you add some more songs?"
			}
		],
	},
	{
		id: "6",
		role: "assistant",
		parts: [
			{
				type: "step-start",
			},
			{
				type: "reasoning",
				state: "done",
				text: "The user has asked me to generate more songs of the same playlist.",
			},
			{
				type: "step-start",
			},
			{
				type: "tool-generatePlaylist",
				toolCallId: "toolcall-2",
				state: "input-streaming",
				input: {
					genre: "Lofi",
				},
			}
		],
	},
	{
		id: "7",
		role: "assistant",
		parts: [
			{
				type: "step-start",
			},
			{
				type: "reasoning",
				text: "This is some reasoning",
				state: "done",
			},
			{
				type: "tool-generatePlaylist",
				toolCallId: "toolcall-3",
				input: {
					genre: "lofi",
				},
				output: [],
				state: "output-available",
			},
			{
				type: "text",
				state: "streaming",
				text: "Here's some more "
			},
		]
	}
];