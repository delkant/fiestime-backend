#!/bin/bash

# CloudFormation Stack Monitoring Script
# Usage: ./monitor-aws-stack.sh <stack-name> <region>

set -e

STACK_NAME="${1:-fiestime-stack-sandbox}"
REGION="${2:-us-east-1}"

echo "🔍 Monitoring CloudFormation Stack: $STACK_NAME in $REGION"
echo "📊 Starting continuous monitoring..."
echo ""

# Function to get stack status
get_stack_status() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND"
}

# Function to get stack events (latest 5)
get_stack_events() {
    echo "📋 Latest Stack Events:"
    aws cloudformation describe-stack-events \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --max-items 5 \
        --query 'StackEvents[].[Timestamp,ResourceStatus,ResourceType,LogicalResourceId,ResourceStatusReason]' \
        --output table 2>/dev/null || echo "No events available"
}

# Function to get failed resources
get_failed_resources() {
    echo "❌ Failed Resources:"
    aws cloudformation describe-stack-events \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'StackEvents[?contains(ResourceStatus, `FAILED`)].[Timestamp,ResourceType,LogicalResourceId,ResourceStatusReason]' \
        --output table 2>/dev/null || echo "No failed resources found"
}

# Main monitoring loop
while true; do
    CURRENT_STATUS=$(get_stack_status)
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    echo "⏰ $TIMESTAMP - Stack Status: $CURRENT_STATUS"

    case "$CURRENT_STATUS" in
        "CREATE_IN_PROGRESS"|"UPDATE_IN_PROGRESS"|"DELETE_IN_PROGRESS")
            echo "🔄 Stack operation in progress..."
            get_stack_events
            ;;
        "CREATE_COMPLETE"|"UPDATE_COMPLETE")
            echo "✅ Stack operation completed successfully!"
            get_stack_events
            echo ""
            echo "🌐 Getting stack outputs..."
            aws cloudformation describe-stacks \
                --stack-name "$STACK_NAME" \
                --region "$REGION" \
                --query 'Stacks[0].Outputs' \
                --output table 2>/dev/null || echo "No outputs available"
            break
            ;;
        "CREATE_FAILED"|"UPDATE_FAILED"|"ROLLBACK_FAILED"|"DELETE_FAILED")
            echo "❌ Stack operation failed!"
            get_stack_events
            echo ""
            get_failed_resources
            break
            ;;
        "ROLLBACK_COMPLETE"|"UPDATE_ROLLBACK_COMPLETE")
            echo "⚠️ Stack rolled back"
            get_stack_events
            echo ""
            get_failed_resources
            break
            ;;
        "NOT_FOUND")
            echo "🔍 Stack not found - may not exist yet or has been deleted"
            ;;
        *)
            echo "🤔 Unknown status: $CURRENT_STATUS"
            get_stack_events
            ;;
    esac

    echo ""
    echo "---"
    sleep 30
done

echo ""
echo "📊 Monitoring completed for stack: $STACK_NAME"