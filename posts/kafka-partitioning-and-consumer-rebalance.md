# Kafka Partitioning: ordering guarantees & consumer rebalance

Kafka scales by dividing topics into **partitions**. Each partition is an ordered, immutable sequence of messages appended to a log file.

## 1. Partition Assignment & Keys

When producing a message:
- If a **key** is provided, Kafka hashes the key (`murmur2(key) % numPartitions`) to send all records with the same key to the *same* partition.
- If no key is provided, messages are round-robined across available partitions.

> **Key Rule**: Message ordering is only strictly guaranteed within a **single partition**, not across different partitions of a topic!

```
Topic: user-events
  ├── Partition 0: [Msg 1] -> [Msg 3] -> [Msg 5]
  └── Partition 1: [Msg 2] -> [Msg 4] -> [Msg 6]
```

## 2. Consumer Groups & Rebalancing

A **Consumer Group** allows multiple workers to divide the work of consuming a topic. Each partition is assigned to exactly one consumer in the group.

When a consumer joins or leaves:
1. The group coordinator triggers a **rebalance**.
2. Partition assignments are recalculated across remaining active members.
3. Consumers resume reading from their last committed offset.
