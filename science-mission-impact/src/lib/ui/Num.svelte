<script>
	let { value } = $props();
</script>

<span class="num">{value ?? ''}</span>

<style>
	.num {
		white-space: nowrap;
	}
</style>
