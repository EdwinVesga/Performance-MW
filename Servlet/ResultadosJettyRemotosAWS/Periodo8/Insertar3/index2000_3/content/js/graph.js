/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 288.0, "minX": 0.0, "maxY": 14117.0, "series": [{"data": [[0.0, 288.0], [0.1, 318.0], [0.2, 326.0], [0.3, 333.0], [0.4, 357.0], [0.5, 374.0], [0.6, 394.0], [0.7, 396.0], [0.8, 412.0], [0.9, 423.0], [1.0, 467.0], [1.1, 511.0], [1.2, 522.0], [1.3, 534.0], [1.4, 653.0], [1.5, 669.0], [1.6, 678.0], [1.7, 1088.0], [1.8, 1387.0], [1.9, 1423.0], [2.0, 1427.0], [2.1, 1468.0], [2.2, 1505.0], [2.3, 1530.0], [2.4, 1568.0], [2.5, 1630.0], [2.6, 1641.0], [2.7, 1685.0], [2.8, 1743.0], [2.9, 1841.0], [3.0, 1865.0], [3.1, 1953.0], [3.2, 1969.0], [3.3, 1990.0], [3.4, 2002.0], [3.5, 2052.0], [3.6, 2073.0], [3.7, 2120.0], [3.8, 2161.0], [3.9, 2168.0], [4.0, 2182.0], [4.1, 2203.0], [4.2, 2238.0], [4.3, 2269.0], [4.4, 2338.0], [4.5, 2415.0], [4.6, 2490.0], [4.7, 2608.0], [4.8, 2689.0], [4.9, 2732.0], [5.0, 2750.0], [5.1, 2790.0], [5.2, 2820.0], [5.3, 2846.0], [5.4, 2858.0], [5.5, 2922.0], [5.6, 2940.0], [5.7, 2970.0], [5.8, 2991.0], [5.9, 3009.0], [6.0, 3019.0], [6.1, 3077.0], [6.2, 3101.0], [6.3, 3115.0], [6.4, 3135.0], [6.5, 3146.0], [6.6, 3154.0], [6.7, 3185.0], [6.8, 3196.0], [6.9, 3205.0], [7.0, 3232.0], [7.1, 3295.0], [7.2, 3325.0], [7.3, 3338.0], [7.4, 3348.0], [7.5, 3364.0], [7.6, 3400.0], [7.7, 3413.0], [7.8, 3429.0], [7.9, 3468.0], [8.0, 3485.0], [8.1, 3514.0], [8.2, 3525.0], [8.3, 3555.0], [8.4, 3571.0], [8.5, 3582.0], [8.6, 3614.0], [8.7, 3621.0], [8.8, 3625.0], [8.9, 3639.0], [9.0, 3655.0], [9.1, 3661.0], [9.2, 3663.0], [9.3, 3677.0], [9.4, 3701.0], [9.5, 3706.0], [9.6, 3731.0], [9.7, 3735.0], [9.8, 3750.0], [9.9, 3756.0], [10.0, 3778.0], [10.1, 3789.0], [10.2, 3794.0], [10.3, 3807.0], [10.4, 3814.0], [10.5, 3818.0], [10.6, 3832.0], [10.7, 3840.0], [10.8, 3849.0], [10.9, 3888.0], [11.0, 3897.0], [11.1, 3917.0], [11.2, 3923.0], [11.3, 3930.0], [11.4, 3931.0], [11.5, 3954.0], [11.6, 3962.0], [11.7, 3969.0], [11.8, 3988.0], [11.9, 3998.0], [12.0, 4008.0], [12.1, 4014.0], [12.2, 4034.0], [12.3, 4052.0], [12.4, 4058.0], [12.5, 4059.0], [12.6, 4073.0], [12.7, 4077.0], [12.8, 4103.0], [12.9, 4111.0], [13.0, 4130.0], [13.1, 4132.0], [13.2, 4157.0], [13.3, 4165.0], [13.4, 4178.0], [13.5, 4185.0], [13.6, 4204.0], [13.7, 4212.0], [13.8, 4229.0], [13.9, 4239.0], [14.0, 4240.0], [14.1, 4257.0], [14.2, 4304.0], [14.3, 4347.0], [14.4, 4355.0], [14.5, 4369.0], [14.6, 4396.0], [14.7, 4399.0], [14.8, 4409.0], [14.9, 4417.0], [15.0, 4452.0], [15.1, 4454.0], [15.2, 4456.0], [15.3, 4465.0], [15.4, 4471.0], [15.5, 4486.0], [15.6, 4491.0], [15.7, 4494.0], [15.8, 4509.0], [15.9, 4525.0], [16.0, 4529.0], [16.1, 4538.0], [16.2, 4540.0], [16.3, 4544.0], [16.4, 4546.0], [16.5, 4550.0], [16.6, 4552.0], [16.7, 4560.0], [16.8, 4567.0], [16.9, 4575.0], [17.0, 4579.0], [17.1, 4593.0], [17.2, 4606.0], [17.3, 4609.0], [17.4, 4614.0], [17.5, 4629.0], [17.6, 4644.0], [17.7, 4647.0], [17.8, 4653.0], [17.9, 4665.0], [18.0, 4673.0], [18.1, 4676.0], [18.2, 4688.0], [18.3, 4711.0], [18.4, 4715.0], [18.5, 4740.0], [18.6, 4748.0], [18.7, 4751.0], [18.8, 4754.0], [18.9, 4769.0], [19.0, 4771.0], [19.1, 4779.0], [19.2, 4795.0], [19.3, 4798.0], [19.4, 4802.0], [19.5, 4838.0], [19.6, 4859.0], [19.7, 4868.0], [19.8, 4875.0], [19.9, 4908.0], [20.0, 4912.0], [20.1, 4920.0], [20.2, 4923.0], [20.3, 4928.0], [20.4, 4934.0], [20.5, 4938.0], [20.6, 4957.0], [20.7, 4997.0], [20.8, 5013.0], [20.9, 5024.0], [21.0, 5033.0], [21.1, 5044.0], [21.2, 5058.0], [21.3, 5068.0], [21.4, 5077.0], [21.5, 5088.0], [21.6, 5108.0], [21.7, 5126.0], [21.8, 5138.0], [21.9, 5156.0], [22.0, 5166.0], [22.1, 5178.0], [22.2, 5180.0], [22.3, 5186.0], [22.4, 5193.0], [22.5, 5207.0], [22.6, 5222.0], [22.7, 5248.0], [22.8, 5251.0], [22.9, 5261.0], [23.0, 5292.0], [23.1, 5299.0], [23.2, 5314.0], [23.3, 5315.0], [23.4, 5326.0], [23.5, 5329.0], [23.6, 5337.0], [23.7, 5355.0], [23.8, 5370.0], [23.9, 5379.0], [24.0, 5390.0], [24.1, 5393.0], [24.2, 5404.0], [24.3, 5421.0], [24.4, 5427.0], [24.5, 5441.0], [24.6, 5444.0], [24.7, 5461.0], [24.8, 5471.0], [24.9, 5493.0], [25.0, 5495.0], [25.1, 5501.0], [25.2, 5528.0], [25.3, 5541.0], [25.4, 5544.0], [25.5, 5547.0], [25.6, 5554.0], [25.7, 5560.0], [25.8, 5575.0], [25.9, 5593.0], [26.0, 5606.0], [26.1, 5607.0], [26.2, 5617.0], [26.3, 5633.0], [26.4, 5636.0], [26.5, 5641.0], [26.6, 5651.0], [26.7, 5661.0], [26.8, 5673.0], [26.9, 5677.0], [27.0, 5679.0], [27.1, 5706.0], [27.2, 5708.0], [27.3, 5732.0], [27.4, 5739.0], [27.5, 5754.0], [27.6, 5761.0], [27.7, 5778.0], [27.8, 5784.0], [27.9, 5794.0], [28.0, 5802.0], [28.1, 5802.0], [28.2, 5816.0], [28.3, 5838.0], [28.4, 5854.0], [28.5, 5863.0], [28.6, 5877.0], [28.7, 5884.0], [28.8, 5919.0], [28.9, 5931.0], [29.0, 5934.0], [29.1, 5955.0], [29.2, 5958.0], [29.3, 5968.0], [29.4, 5989.0], [29.5, 6001.0], [29.6, 6013.0], [29.7, 6024.0], [29.8, 6031.0], [29.9, 6038.0], [30.0, 6045.0], [30.1, 6057.0], [30.2, 6070.0], [30.3, 6083.0], [30.4, 6097.0], [30.5, 6115.0], [30.6, 6118.0], [30.7, 6123.0], [30.8, 6124.0], [30.9, 6151.0], [31.0, 6156.0], [31.1, 6175.0], [31.2, 6207.0], [31.3, 6246.0], [31.4, 6264.0], [31.5, 6285.0], [31.6, 6290.0], [31.7, 6298.0], [31.8, 6305.0], [31.9, 6318.0], [32.0, 6329.0], [32.1, 6369.0], [32.2, 6388.0], [32.3, 6417.0], [32.4, 6432.0], [32.5, 6467.0], [32.6, 6476.0], [32.7, 6477.0], [32.8, 6503.0], [32.9, 6508.0], [33.0, 6518.0], [33.1, 6533.0], [33.2, 6560.0], [33.3, 6562.0], [33.4, 6582.0], [33.5, 6600.0], [33.6, 6606.0], [33.7, 6619.0], [33.8, 6632.0], [33.9, 6644.0], [34.0, 6664.0], [34.1, 6693.0], [34.2, 6706.0], [34.3, 6726.0], [34.4, 6742.0], [34.5, 6776.0], [34.6, 6803.0], [34.7, 6814.0], [34.8, 6834.0], [34.9, 6839.0], [35.0, 6847.0], [35.1, 6858.0], [35.2, 6882.0], [35.3, 6887.0], [35.4, 6910.0], [35.5, 6923.0], [35.6, 6929.0], [35.7, 6943.0], [35.8, 6954.0], [35.9, 6961.0], [36.0, 6964.0], [36.1, 6986.0], [36.2, 6998.0], [36.3, 7007.0], [36.4, 7019.0], [36.5, 7026.0], [36.6, 7033.0], [36.7, 7050.0], [36.8, 7051.0], [36.9, 7054.0], [37.0, 7064.0], [37.1, 7071.0], [37.2, 7074.0], [37.3, 7090.0], [37.4, 7105.0], [37.5, 7126.0], [37.6, 7129.0], [37.7, 7138.0], [37.8, 7161.0], [37.9, 7181.0], [38.0, 7194.0], [38.1, 7196.0], [38.2, 7214.0], [38.3, 7223.0], [38.4, 7234.0], [38.5, 7239.0], [38.6, 7240.0], [38.7, 7246.0], [38.8, 7249.0], [38.9, 7267.0], [39.0, 7276.0], [39.1, 7285.0], [39.2, 7305.0], [39.3, 7309.0], [39.4, 7319.0], [39.5, 7338.0], [39.6, 7370.0], [39.7, 7378.0], [39.8, 7384.0], [39.9, 7402.0], [40.0, 7403.0], [40.1, 7414.0], [40.2, 7426.0], [40.3, 7447.0], [40.4, 7455.0], [40.5, 7468.0], [40.6, 7471.0], [40.7, 7477.0], [40.8, 7490.0], [40.9, 7510.0], [41.0, 7516.0], [41.1, 7522.0], [41.2, 7545.0], [41.3, 7561.0], [41.4, 7575.0], [41.5, 7596.0], [41.6, 7610.0], [41.7, 7618.0], [41.8, 7624.0], [41.9, 7629.0], [42.0, 7639.0], [42.1, 7664.0], [42.2, 7674.0], [42.3, 7675.0], [42.4, 7696.0], [42.5, 7708.0], [42.6, 7723.0], [42.7, 7739.0], [42.8, 7764.0], [42.9, 7776.0], [43.0, 7786.0], [43.1, 7791.0], [43.2, 7809.0], [43.3, 7813.0], [43.4, 7825.0], [43.5, 7835.0], [43.6, 7853.0], [43.7, 7873.0], [43.8, 7883.0], [43.9, 7891.0], [44.0, 7909.0], [44.1, 7917.0], [44.2, 7927.0], [44.3, 7942.0], [44.4, 7968.0], [44.5, 7983.0], [44.6, 7990.0], [44.7, 8004.0], [44.8, 8007.0], [44.9, 8015.0], [45.0, 8030.0], [45.1, 8050.0], [45.2, 8055.0], [45.3, 8067.0], [45.4, 8089.0], [45.5, 8091.0], [45.6, 8105.0], [45.7, 8129.0], [45.8, 8138.0], [45.9, 8170.0], [46.0, 8187.0], [46.1, 8221.0], [46.2, 8235.0], [46.3, 8242.0], [46.4, 8266.0], [46.5, 8280.0], [46.6, 8297.0], [46.7, 8303.0], [46.8, 8307.0], [46.9, 8310.0], [47.0, 8322.0], [47.1, 8334.0], [47.2, 8339.0], [47.3, 8342.0], [47.4, 8361.0], [47.5, 8367.0], [47.6, 8396.0], [47.7, 8403.0], [47.8, 8408.0], [47.9, 8416.0], [48.0, 8430.0], [48.1, 8439.0], [48.2, 8461.0], [48.3, 8520.0], [48.4, 8520.0], [48.5, 8530.0], [48.6, 8542.0], [48.7, 8552.0], [48.8, 8581.0], [48.9, 8604.0], [49.0, 8631.0], [49.1, 8650.0], [49.2, 8691.0], [49.3, 8705.0], [49.4, 8709.0], [49.5, 8721.0], [49.6, 8735.0], [49.7, 8745.0], [49.8, 8752.0], [49.9, 8761.0], [50.0, 8769.0], [50.1, 8778.0], [50.2, 8785.0], [50.3, 8789.0], [50.4, 8806.0], [50.5, 8822.0], [50.6, 8836.0], [50.7, 8844.0], [50.8, 8850.0], [50.9, 8856.0], [51.0, 8890.0], [51.1, 8897.0], [51.2, 8907.0], [51.3, 8923.0], [51.4, 8952.0], [51.5, 8965.0], [51.6, 8997.0], [51.7, 9007.0], [51.8, 9018.0], [51.9, 9039.0], [52.0, 9049.0], [52.1, 9082.0], [52.2, 9086.0], [52.3, 9127.0], [52.4, 9133.0], [52.5, 9139.0], [52.6, 9156.0], [52.7, 9165.0], [52.8, 9172.0], [52.9, 9210.0], [53.0, 9240.0], [53.1, 9250.0], [53.2, 9274.0], [53.3, 9287.0], [53.4, 9298.0], [53.5, 9322.0], [53.6, 9324.0], [53.7, 9348.0], [53.8, 9354.0], [53.9, 9358.0], [54.0, 9382.0], [54.1, 9416.0], [54.2, 9427.0], [54.3, 9438.0], [54.4, 9448.0], [54.5, 9451.0], [54.6, 9467.0], [54.7, 9486.0], [54.8, 9489.0], [54.9, 9506.0], [55.0, 9513.0], [55.1, 9540.0], [55.2, 9545.0], [55.3, 9548.0], [55.4, 9558.0], [55.5, 9581.0], [55.6, 9589.0], [55.7, 9609.0], [55.8, 9636.0], [55.9, 9641.0], [56.0, 9656.0], [56.1, 9661.0], [56.2, 9673.0], [56.3, 9673.0], [56.4, 9677.0], [56.5, 9691.0], [56.6, 9700.0], [56.7, 9707.0], [56.8, 9726.0], [56.9, 9738.0], [57.0, 9744.0], [57.1, 9746.0], [57.2, 9761.0], [57.3, 9774.0], [57.4, 9780.0], [57.5, 9785.0], [57.6, 9795.0], [57.7, 9799.0], [57.8, 9800.0], [57.9, 9830.0], [58.0, 9847.0], [58.1, 9862.0], [58.2, 9878.0], [58.3, 9888.0], [58.4, 9893.0], [58.5, 9910.0], [58.6, 9916.0], [58.7, 9923.0], [58.8, 9936.0], [58.9, 9952.0], [59.0, 9962.0], [59.1, 9967.0], [59.2, 9987.0], [59.3, 9994.0], [59.4, 10002.0], [59.5, 10010.0], [59.6, 10027.0], [59.7, 10033.0], [59.8, 10038.0], [59.9, 10043.0], [60.0, 10045.0], [60.1, 10055.0], [60.2, 10069.0], [60.3, 10097.0], [60.4, 10104.0], [60.5, 10107.0], [60.6, 10113.0], [60.7, 10121.0], [60.8, 10130.0], [60.9, 10139.0], [61.0, 10159.0], [61.1, 10173.0], [61.2, 10189.0], [61.3, 10199.0], [61.4, 10201.0], [61.5, 10208.0], [61.6, 10212.0], [61.7, 10222.0], [61.8, 10237.0], [61.9, 10246.0], [62.0, 10277.0], [62.1, 10300.0], [62.2, 10316.0], [62.3, 10333.0], [62.4, 10337.0], [62.5, 10343.0], [62.6, 10345.0], [62.7, 10353.0], [62.8, 10368.0], [62.9, 10375.0], [63.0, 10383.0], [63.1, 10385.0], [63.2, 10389.0], [63.3, 10406.0], [63.4, 10412.0], [63.5, 10418.0], [63.6, 10432.0], [63.7, 10435.0], [63.8, 10451.0], [63.9, 10459.0], [64.0, 10460.0], [64.1, 10461.0], [64.2, 10483.0], [64.3, 10490.0], [64.4, 10513.0], [64.5, 10520.0], [64.6, 10532.0], [64.7, 10542.0], [64.8, 10560.0], [64.9, 10562.0], [65.0, 10570.0], [65.1, 10583.0], [65.2, 10586.0], [65.3, 10589.0], [65.4, 10594.0], [65.5, 10600.0], [65.6, 10604.0], [65.7, 10611.0], [65.8, 10612.0], [65.9, 10623.0], [66.0, 10646.0], [66.1, 10670.0], [66.2, 10695.0], [66.3, 10707.0], [66.4, 10713.0], [66.5, 10724.0], [66.6, 10737.0], [66.7, 10761.0], [66.8, 10783.0], [66.9, 10786.0], [67.0, 10795.0], [67.1, 10800.0], [67.2, 10817.0], [67.3, 10831.0], [67.4, 10839.0], [67.5, 10852.0], [67.6, 10859.0], [67.7, 10866.0], [67.8, 10877.0], [67.9, 10885.0], [68.0, 10889.0], [68.1, 10892.0], [68.2, 10896.0], [68.3, 10923.0], [68.4, 10943.0], [68.5, 10957.0], [68.6, 10963.0], [68.7, 10967.0], [68.8, 10977.0], [68.9, 10984.0], [69.0, 10990.0], [69.1, 11005.0], [69.2, 11008.0], [69.3, 11020.0], [69.4, 11038.0], [69.5, 11050.0], [69.6, 11077.0], [69.7, 11093.0], [69.8, 11098.0], [69.9, 11110.0], [70.0, 11119.0], [70.1, 11126.0], [70.2, 11133.0], [70.3, 11135.0], [70.4, 11153.0], [70.5, 11163.0], [70.6, 11169.0], [70.7, 11170.0], [70.8, 11188.0], [70.9, 11201.0], [71.0, 11206.0], [71.1, 11209.0], [71.2, 11215.0], [71.3, 11221.0], [71.4, 11222.0], [71.5, 11228.0], [71.6, 11236.0], [71.7, 11250.0], [71.8, 11253.0], [71.9, 11261.0], [72.0, 11263.0], [72.1, 11278.0], [72.2, 11282.0], [72.3, 11284.0], [72.4, 11286.0], [72.5, 11287.0], [72.6, 11303.0], [72.7, 11311.0], [72.8, 11313.0], [72.9, 11321.0], [73.0, 11324.0], [73.1, 11344.0], [73.2, 11352.0], [73.3, 11372.0], [73.4, 11377.0], [73.5, 11394.0], [73.6, 11410.0], [73.7, 11411.0], [73.8, 11418.0], [73.9, 11423.0], [74.0, 11429.0], [74.1, 11438.0], [74.2, 11443.0], [74.3, 11452.0], [74.4, 11456.0], [74.5, 11484.0], [74.6, 11489.0], [74.7, 11496.0], [74.8, 11500.0], [74.9, 11512.0], [75.0, 11517.0], [75.1, 11529.0], [75.2, 11530.0], [75.3, 11531.0], [75.4, 11544.0], [75.5, 11557.0], [75.6, 11560.0], [75.7, 11561.0], [75.8, 11569.0], [75.9, 11575.0], [76.0, 11582.0], [76.1, 11596.0], [76.2, 11607.0], [76.3, 11608.0], [76.4, 11609.0], [76.5, 11616.0], [76.6, 11626.0], [76.7, 11631.0], [76.8, 11644.0], [76.9, 11654.0], [77.0, 11672.0], [77.1, 11684.0], [77.2, 11687.0], [77.3, 11703.0], [77.4, 11714.0], [77.5, 11716.0], [77.6, 11722.0], [77.7, 11726.0], [77.8, 11730.0], [77.9, 11736.0], [78.0, 11736.0], [78.1, 11738.0], [78.2, 11756.0], [78.3, 11760.0], [78.4, 11772.0], [78.5, 11786.0], [78.6, 11796.0], [78.7, 11808.0], [78.8, 11835.0], [78.9, 11841.0], [79.0, 11851.0], [79.1, 11864.0], [79.2, 11879.0], [79.3, 11892.0], [79.4, 11900.0], [79.5, 11915.0], [79.6, 11920.0], [79.7, 11933.0], [79.8, 11947.0], [79.9, 11950.0], [80.0, 11962.0], [80.1, 11975.0], [80.2, 11980.0], [80.3, 11997.0], [80.4, 12007.0], [80.5, 12011.0], [80.6, 12020.0], [80.7, 12026.0], [80.8, 12058.0], [80.9, 12084.0], [81.0, 12103.0], [81.1, 12107.0], [81.2, 12125.0], [81.3, 12138.0], [81.4, 12146.0], [81.5, 12147.0], [81.6, 12154.0], [81.7, 12159.0], [81.8, 12197.0], [81.9, 12210.0], [82.0, 12227.0], [82.1, 12239.0], [82.2, 12254.0], [82.3, 12258.0], [82.4, 12275.0], [82.5, 12295.0], [82.6, 12328.0], [82.7, 12334.0], [82.8, 12344.0], [82.9, 12346.0], [83.0, 12351.0], [83.1, 12355.0], [83.2, 12360.0], [83.3, 12373.0], [83.4, 12378.0], [83.5, 12380.0], [83.6, 12402.0], [83.7, 12405.0], [83.8, 12408.0], [83.9, 12416.0], [84.0, 12422.0], [84.1, 12429.0], [84.2, 12433.0], [84.3, 12444.0], [84.4, 12458.0], [84.5, 12464.0], [84.6, 12465.0], [84.7, 12474.0], [84.8, 12475.0], [84.9, 12483.0], [85.0, 12488.0], [85.1, 12505.0], [85.2, 12509.0], [85.3, 12517.0], [85.4, 12524.0], [85.5, 12533.0], [85.6, 12540.0], [85.7, 12543.0], [85.8, 12547.0], [85.9, 12549.0], [86.0, 12561.0], [86.1, 12572.0], [86.2, 12586.0], [86.3, 12589.0], [86.4, 12602.0], [86.5, 12610.0], [86.6, 12632.0], [86.7, 12646.0], [86.8, 12652.0], [86.9, 12658.0], [87.0, 12662.0], [87.1, 12668.0], [87.2, 12670.0], [87.3, 12680.0], [87.4, 12683.0], [87.5, 12687.0], [87.6, 12691.0], [87.7, 12698.0], [87.8, 12710.0], [87.9, 12713.0], [88.0, 12724.0], [88.1, 12736.0], [88.2, 12741.0], [88.3, 12748.0], [88.4, 12750.0], [88.5, 12758.0], [88.6, 12768.0], [88.7, 12773.0], [88.8, 12782.0], [88.9, 12791.0], [89.0, 12802.0], [89.1, 12803.0], [89.2, 12808.0], [89.3, 12823.0], [89.4, 12842.0], [89.5, 12844.0], [89.6, 12854.0], [89.7, 12856.0], [89.8, 12860.0], [89.9, 12862.0], [90.0, 12874.0], [90.1, 12889.0], [90.2, 12898.0], [90.3, 12905.0], [90.4, 12924.0], [90.5, 12933.0], [90.6, 12942.0], [90.7, 12958.0], [90.8, 12968.0], [90.9, 12975.0], [91.0, 12983.0], [91.1, 12988.0], [91.2, 13011.0], [91.3, 13050.0], [91.4, 13075.0], [91.5, 13084.0], [91.6, 13097.0], [91.7, 13117.0], [91.8, 13131.0], [91.9, 13137.0], [92.0, 13142.0], [92.1, 13148.0], [92.2, 13185.0], [92.3, 13201.0], [92.4, 13222.0], [92.5, 13228.0], [92.6, 13231.0], [92.7, 13240.0], [92.8, 13246.0], [92.9, 13261.0], [93.0, 13266.0], [93.1, 13271.0], [93.2, 13287.0], [93.3, 13299.0], [93.4, 13307.0], [93.5, 13311.0], [93.6, 13323.0], [93.7, 13334.0], [93.8, 13340.0], [93.9, 13357.0], [94.0, 13367.0], [94.1, 13369.0], [94.2, 13381.0], [94.3, 13387.0], [94.4, 13396.0], [94.5, 13404.0], [94.6, 13419.0], [94.7, 13433.0], [94.8, 13442.0], [94.9, 13443.0], [95.0, 13449.0], [95.1, 13458.0], [95.2, 13461.0], [95.3, 13464.0], [95.4, 13473.0], [95.5, 13477.0], [95.6, 13486.0], [95.7, 13495.0], [95.8, 13498.0], [95.9, 13504.0], [96.0, 13509.0], [96.1, 13516.0], [96.2, 13520.0], [96.3, 13530.0], [96.4, 13545.0], [96.5, 13549.0], [96.6, 13557.0], [96.7, 13564.0], [96.8, 13565.0], [96.9, 13567.0], [97.0, 13573.0], [97.1, 13585.0], [97.2, 13595.0], [97.3, 13602.0], [97.4, 13619.0], [97.5, 13622.0], [97.6, 13625.0], [97.7, 13632.0], [97.8, 13659.0], [97.9, 13687.0], [98.0, 13697.0], [98.1, 13704.0], [98.2, 13726.0], [98.3, 13737.0], [98.4, 13739.0], [98.5, 13744.0], [98.6, 13751.0], [98.7, 13758.0], [98.8, 13764.0], [98.9, 13789.0], [99.0, 13813.0], [99.1, 13817.0], [99.2, 13826.0], [99.3, 13833.0], [99.4, 13859.0], [99.5, 13946.0], [99.6, 13979.0], [99.7, 13995.0], [99.8, 14038.0], [99.9, 14074.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 35.0, "series": [{"data": [[200.0, 2.0], [300.0, 12.0], [400.0, 7.0], [500.0, 6.0], [600.0, 6.0], [1000.0, 1.0], [1200.0, 1.0], [1300.0, 1.0], [1400.0, 7.0], [1500.0, 6.0], [1600.0, 7.0], [1700.0, 2.0], [1800.0, 3.0], [1900.0, 6.0], [2000.0, 6.0], [2100.0, 9.0], [2200.0, 6.0], [2300.0, 1.0], [2400.0, 4.0], [2600.0, 4.0], [2700.0, 7.0], [2800.0, 6.0], [2900.0, 7.0], [3000.0, 6.0], [3100.0, 14.0], [3300.0, 8.0], [3200.0, 7.0], [3400.0, 9.0], [3500.0, 11.0], [3600.0, 16.0], [3700.0, 16.0], [3800.0, 16.0], [3900.0, 18.0], [4000.0, 16.0], [4100.0, 17.0], [4300.0, 11.0], [4200.0, 12.0], [4400.0, 21.0], [4500.0, 27.0], [4600.0, 22.0], [4700.0, 22.0], [4800.0, 11.0], [4900.0, 17.0], [5000.0, 16.0], [5100.0, 19.0], [5300.0, 21.0], [5200.0, 13.0], [5400.0, 18.0], [5600.0, 21.0], [5500.0, 18.0], [5800.0, 15.0], [5700.0, 19.0], [5900.0, 14.0], [6000.0, 20.0], [6100.0, 14.0], [6300.0, 11.0], [6200.0, 12.0], [6500.0, 14.0], [6600.0, 14.0], [6400.0, 10.0], [6700.0, 8.0], [6900.0, 18.0], [6800.0, 16.0], [7000.0, 22.0], [7100.0, 15.0], [7300.0, 14.0], [7200.0, 22.0], [7400.0, 19.0], [7600.0, 17.0], [7500.0, 15.0], [7800.0, 16.0], [7900.0, 13.0], [7700.0, 15.0], [8100.0, 10.0], [8000.0, 18.0], [8300.0, 20.0], [8500.0, 12.0], [8700.0, 23.0], [8400.0, 13.0], [8200.0, 12.0], [8600.0, 7.0], [8900.0, 10.0], [9000.0, 12.0], [8800.0, 15.0], [9200.0, 11.0], [9100.0, 13.0], [9500.0, 15.0], [9300.0, 13.0], [9400.0, 16.0], [9600.0, 19.0], [9700.0, 24.0], [9800.0, 14.0], [9900.0, 18.0], [10000.0, 19.0], [10200.0, 15.0], [10100.0, 20.0], [10300.0, 23.0], [10600.0, 16.0], [10700.0, 16.0], [10500.0, 22.0], [10400.0, 23.0], [10800.0, 23.0], [10900.0, 17.0], [11100.0, 19.0], [11000.0, 16.0], [11200.0, 35.0], [11500.0, 27.0], [11400.0, 24.0], [11700.0, 27.0], [11300.0, 20.0], [11600.0, 23.0], [11900.0, 20.0], [11800.0, 15.0], [12000.0, 12.0], [12100.0, 17.0], [12200.0, 14.0], [12400.0, 30.0], [12300.0, 21.0], [12600.0, 28.0], [12700.0, 25.0], [12500.0, 25.0], [12900.0, 17.0], [12800.0, 26.0], [13100.0, 13.0], [13300.0, 22.0], [13000.0, 10.0], [13200.0, 21.0], [13500.0, 29.0], [13600.0, 16.0], [13400.0, 28.0], [13700.0, 17.0], [13800.0, 11.0], [14000.0, 4.0], [13900.0, 5.0], [14100.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 14100.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 21.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1957.0, "series": [{"data": [[1.0, 22.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 21.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1957.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 778.7235000000006, "minX": 1.54960806E12, "maxY": 778.7235000000006, "series": [{"data": [[1.54960806E12, 778.7235000000006]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 516.0, "minX": 1.0, "maxY": 14117.0, "series": [{"data": [[2.0, 13620.0], [3.0, 13097.0], [4.0, 13460.0], [5.0, 13500.0], [6.0, 13738.0], [7.0, 13486.0], [8.0, 12860.0], [9.0, 12802.0], [10.0, 13131.0], [11.0, 12842.0], [12.0, 13744.0], [13.0, 13822.0], [14.0, 12942.0], [15.0, 13231.0], [16.0, 12926.0], [17.0, 13523.0], [18.0, 13548.0], [20.0, 13122.0], [21.0, 13515.0], [23.0, 13361.0], [24.0, 12861.0], [25.0, 13011.0], [26.0, 12862.0], [27.0, 13244.0], [28.0, 12844.0], [29.0, 13464.0], [30.0, 13751.0], [31.0, 13710.0], [32.0, 13833.0], [35.0, 13516.0], [34.0, 13403.0], [37.0, 13631.0], [36.0, 13625.0], [39.0, 13732.0], [38.0, 13549.0], [41.0, 13433.0], [40.0, 13589.0], [43.0, 13176.5], [45.0, 13203.0], [44.0, 13473.0], [47.0, 13764.0], [46.0, 13531.0], [49.0, 13419.0], [48.0, 13737.0], [51.0, 13564.0], [50.0, 13802.0], [53.0, 13142.0], [52.0, 13442.0], [55.0, 13659.0], [54.0, 13595.0], [57.0, 13117.0], [56.0, 13697.0], [58.0, 6546.0], [59.0, 7076.5], [61.0, 13955.0], [60.0, 13401.0], [62.0, 6927.0], [63.0, 7085.0], [64.0, 6916.5], [66.0, 6602.0], [65.0, 13898.0], [69.0, 6649.5], [68.0, 5457.6], [70.0, 6832.5], [71.0, 12691.0], [74.0, 6902.5], [75.0, 4504.333333333334], [73.0, 12724.0], [72.0, 13995.0], [77.0, 6751.5], [78.0, 4592.0], [79.0, 12988.0], [76.0, 13602.0], [82.0, 4846.666666666667], [83.0, 12646.0], [81.0, 12955.0], [80.0, 13691.0], [86.0, 3704.5], [87.0, 7049.5], [85.0, 13096.0], [84.0, 13557.0], [88.0, 516.0], [91.0, 12924.0], [90.0, 12988.0], [89.0, 13301.5], [92.0, 6701.5], [95.0, 13659.0], [94.0, 12856.0], [93.0, 12975.0], [99.0, 13404.0], [98.0, 13266.0], [97.0, 13145.0], [96.0, 12687.0], [103.0, 13445.0], [102.0, 13789.0], [101.0, 12682.0], [100.0, 12844.0], [107.0, 13050.0], [106.0, 13826.0], [105.0, 13392.0], [104.0, 13758.0], [111.0, 6602.5], [110.0, 13339.0], [109.0, 12782.0], [108.0, 13699.0], [115.0, 12977.0], [114.0, 13474.0], [113.0, 12782.0], [119.0, 13449.0], [118.0, 13823.5], [116.0, 13357.0], [121.0, 6922.5], [122.0, 6993.5], [123.0, 13299.0], [120.0, 12658.0], [127.0, 13625.0], [126.0, 13570.0], [125.0, 13323.0], [124.0, 13704.0], [135.0, 12779.0], [134.0, 13576.0], [133.0, 13228.0], [132.0, 12869.0], [131.0, 13425.0], [130.0, 13477.0], [129.0, 13412.0], [143.0, 13673.0], [142.0, 13329.0], [141.0, 14045.0], [140.0, 13946.0], [139.0, 13229.0], [138.0, 12534.0], [137.0, 12547.0], [136.0, 13075.0], [145.0, 6743.0], [146.0, 7032.5], [151.0, 13344.0], [150.0, 13308.0], [149.0, 12652.0], [148.0, 12632.0], [147.0, 13756.0], [144.0, 13990.0], [153.0, 4910.0], [155.0, 7118.0], [159.0, 13139.0], [158.0, 12431.0], [157.0, 12823.0], [156.0, 13371.0], [154.0, 12457.0], [152.0, 12668.0], [167.0, 12851.0], [166.0, 13816.0], [165.0, 12698.0], [164.0, 13482.0], [163.0, 13562.0], [162.0, 12882.0], [161.0, 12528.0], [160.0, 13269.0], [175.0, 13075.0], [174.0, 12458.0], [173.0, 12549.0], [172.0, 13859.0], [171.0, 12748.0], [170.0, 12398.0], [169.0, 13504.0], [168.0, 12533.0], [183.0, 12547.0], [182.0, 12404.0], [181.0, 12796.0], [180.0, 12441.0], [179.0, 12647.0], [178.0, 12662.0], [177.0, 13555.0], [176.0, 12543.0], [191.0, 13295.0], [190.0, 13458.0], [189.0, 13287.0], [188.0, 12758.0], [187.0, 12406.0], [186.0, 13382.0], [185.0, 12474.0], [184.0, 13246.0], [199.0, 12802.0], [198.0, 13150.0], [197.0, 12433.0], [196.0, 12715.0], [195.0, 12505.0], [194.0, 12510.0], [193.0, 12899.0], [192.0, 13134.0], [207.0, 13817.0], [206.0, 13854.0], [205.0, 13381.0], [204.0, 13726.0], [203.0, 13317.0], [201.0, 12854.0], [200.0, 13307.0], [215.0, 13619.0], [214.0, 13443.0], [213.0, 12255.0], [212.0, 13473.0], [211.0, 13784.0], [210.0, 13739.0], [209.0, 13190.0], [208.0, 13509.0], [223.0, 13567.0], [222.0, 13201.0], [221.0, 14117.0], [220.0, 12254.0], [219.0, 14036.0], [218.0, 13137.0], [217.0, 13750.0], [216.0, 12488.0], [230.0, 13260.0], [229.0, 12710.0], [228.0, 13387.0], [226.0, 12334.0], [225.0, 12743.0], [224.0, 13148.0], [239.0, 13225.0], [238.0, 12138.0], [237.0, 12376.0], [236.0, 12632.0], [235.0, 13222.0], [234.0, 13361.0], [233.0, 12556.0], [232.0, 13334.5], [247.0, 12961.0], [245.0, 12328.0], [244.0, 13495.0], [243.0, 12804.0], [242.0, 12685.0], [241.0, 13468.0], [240.0, 13615.0], [255.0, 12157.0], [254.0, 13979.0], [253.0, 13530.0], [252.0, 12380.0], [251.0, 13078.0], [250.0, 12728.0], [249.0, 12509.0], [248.0, 12464.0], [270.0, 12475.0], [271.0, 12355.0], [269.0, 12703.0], [268.0, 14038.0], [267.0, 13564.0], [266.0, 12680.0], [265.0, 12756.0], [264.0, 12465.0], [263.0, 13632.0], [257.0, 12740.0], [256.0, 12856.0], [259.0, 13585.0], [258.0, 12239.0], [262.0, 12769.0], [261.0, 13105.0], [260.0, 13622.0], [286.0, 13240.0], [287.0, 12517.0], [285.0, 11841.0], [284.0, 11443.0], [283.0, 11736.0], [282.0, 12565.0], [281.0, 13261.0], [280.0, 11949.0], [279.0, 12378.0], [273.0, 13520.0], [272.0, 13301.0], [275.0, 12474.0], [274.0, 12310.0], [278.0, 12610.0], [277.0, 12235.0], [276.0, 12150.0], [301.0, 11730.0], [303.0, 4737.833333333333], [300.0, 11631.0], [291.0, 12790.5], [289.0, 11607.0], [288.0, 12905.0], [299.0, 12466.0], [298.0, 12579.0], [296.0, 12623.0], [295.0, 11352.0], [294.0, 12358.0], [293.0, 12540.0], [292.0, 12405.0], [318.0, 12749.0], [312.0, 7038.5], [307.0, 6770.0], [306.0, 13084.0], [305.0, 11719.0], [304.0, 11687.0], [311.0, 12418.0], [310.0, 12444.0], [309.0, 11767.0], [308.0, 13367.0], [313.0, 6894.0], [319.0, 6850.0], [317.0, 12933.0], [316.0, 12360.0], [315.0, 12791.0], [314.0, 12662.0], [335.0, 11311.0], [322.0, 6597.0], [320.0, 7033.0], [321.0, 11745.0], [327.0, 11077.0], [326.0, 11738.0], [325.0, 11082.0], [324.0, 12312.0], [330.0, 7187.5], [334.0, 12670.0], [333.0, 12416.0], [332.0, 12351.0], [331.0, 12608.0], [329.0, 11684.0], [328.0, 12483.0], [351.0, 6828.0], [338.0, 5332.0], [337.0, 6780.5], [336.0, 12200.0], [343.0, 12295.0], [342.0, 11411.0], [341.0, 12240.0], [340.0, 11524.0], [345.0, 6539.0], [344.0, 11557.0], [348.0, 6486.0], [339.0, 11204.0], [350.0, 7096.5], [349.0, 12687.0], [347.0, 12958.0], [346.0, 12227.0], [366.0, 11310.0], [358.0, 6503.5], [357.0, 12545.0], [356.0, 12258.0], [359.0, 12585.0], [353.0, 13131.0], [352.0, 12815.0], [355.0, 12713.0], [354.0, 12125.0], [367.0, 11222.0], [365.0, 11335.0], [364.0, 12736.0], [363.0, 11286.0], [362.0, 11410.0], [361.0, 11253.0], [360.0, 12197.0], [382.0, 6813.5], [369.0, 7220.0], [371.0, 7168.5], [370.0, 12895.0], [375.0, 5348.333333333334], [368.0, 12105.0], [374.0, 11187.0], [373.0, 11098.0], [372.0, 11093.0], [383.0, 11781.0], [377.0, 12541.0], [376.0, 10943.0], [381.0, 12007.0], [380.0, 12524.0], [379.0, 12408.0], [378.0, 11892.0], [399.0, 12602.0], [391.0, 7138.5], [388.0, 7195.5], [390.0, 12662.0], [389.0, 11977.0], [393.0, 6833.0], [392.0, 11730.0], [396.0, 7164.0], [387.0, 11915.0], [386.0, 11241.0], [385.0, 12741.0], [384.0, 11163.0], [398.0, 12147.0], [397.0, 11950.0], [395.0, 12103.0], [394.0, 11823.0], [415.0, 6757.5], [406.0, 7241.0], [405.0, 12271.0], [404.0, 11038.0], [407.0, 11955.0], [401.0, 12486.0], [400.0, 12889.0], [403.0, 11947.0], [402.0, 11864.0], [408.0, 4964.333333333334], [412.0, 4243.0], [414.0, 10786.0], [413.0, 12692.0], [411.0, 12144.0], [410.0, 11759.0], [409.0, 12345.0], [430.0, 11418.0], [419.0, 7074.5], [418.0, 12380.0], [417.0, 12364.0], [416.0, 12683.0], [423.0, 12181.0], [422.0, 12107.0], [421.0, 12212.0], [420.0, 11997.0], [431.0, 10444.0], [429.0, 11561.0], [428.0, 11975.0], [427.0, 12425.0], [426.0, 11864.0], [425.0, 12429.0], [424.0, 11609.0], [446.0, 12968.0], [436.0, 2120.0], [437.0, 11875.0], [439.0, 12146.0], [432.0, 10863.0], [434.0, 11714.0], [433.0, 11883.0], [438.0, 11489.0], [435.0, 6961.0], [447.0, 12337.0], [445.0, 12058.0], [444.0, 12346.0], [443.0, 12676.0], [442.0, 11738.0], [441.0, 11850.0], [440.0, 12084.0], [462.0, 12210.0], [457.0, 5573.0], [452.0, 5296.0], [453.0, 11793.0], [455.0, 11494.0], [449.0, 11966.0], [448.0, 11581.0], [451.0, 12670.0], [450.0, 11644.0], [454.0, 11607.0], [459.0, 5297.333333333334], [463.0, 11808.0], [461.0, 11980.0], [460.0, 11644.0], [458.0, 11733.0], [456.0, 11621.0], [478.0, 11489.5], [465.0, 6964.0], [464.0, 11916.0], [471.0, 12280.0], [470.0, 11423.0], [469.0, 10460.0], [468.0, 11533.0], [466.0, 6711.0], [479.0, 11608.0], [476.0, 11808.0], [467.0, 11786.0], [475.0, 11997.0], [474.0, 11529.0], [473.0, 11879.0], [472.0, 11962.0], [493.0, 11608.0], [482.0, 5295.333333333334], [481.0, 6752.5], [485.0, 6980.0], [484.0, 11716.0], [487.0, 11449.0], [480.0, 12062.0], [486.0, 12402.0], [494.0, 11170.0], [492.0, 11455.0], [483.0, 12411.0], [491.0, 11225.0], [490.0, 11374.0], [489.0, 11898.0], [488.0, 11285.0], [511.0, 10966.0], [497.0, 7217.5], [503.0, 11631.0], [496.0, 11976.5], [502.0, 11654.0], [501.0, 11530.0], [500.0, 11236.0], [505.0, 6718.5], [510.0, 11467.0], [509.0, 12110.0], [508.0, 11169.0], [499.0, 10972.0], [498.0, 11489.0], [507.0, 11604.0], [506.0, 11133.0], [504.0, 11438.0], [540.0, 12154.0], [518.0, 6780.5], [519.0, 6974.5], [537.0, 11383.0], [536.0, 12018.0], [520.0, 7037.0], [521.0, 11839.0], [522.0, 7074.0], [527.0, 10960.0], [512.0, 11188.0], [515.0, 11429.0], [514.0, 11785.0], [517.0, 11253.0], [516.0, 11636.0], [526.0, 11714.0], [525.0, 11394.0], [524.0, 11008.0], [523.0, 11431.0], [543.0, 11020.0], [529.0, 11596.0], [528.0, 11626.0], [531.0, 11590.0], [530.0, 11317.0], [533.0, 11261.0], [532.0, 12007.0], [535.0, 10785.0], [534.0, 11616.0], [542.0, 11439.0], [541.0, 11902.0], [539.0, 11263.0], [538.0, 11216.0], [573.0, 11206.0], [562.0, 6870.0], [561.0, 11005.0], [560.0, 12094.0], [563.0, 11936.0], [565.0, 11283.0], [564.0, 11703.0], [567.0, 11736.0], [566.0, 10645.0], [575.0, 11615.0], [574.0, 11861.0], [572.0, 11497.0], [571.0, 11496.0], [570.0, 11851.0], [569.0, 11724.0], [568.0, 11566.0], [551.0, 11559.0], [550.0, 11303.0], [549.0, 10737.0], [548.0, 11796.0], [547.0, 10570.0], [546.0, 11311.0], [545.0, 10792.0], [544.0, 11512.0], [559.0, 11933.0], [558.0, 10707.0], [557.0, 11350.0], [556.0, 11377.0], [555.0, 10984.0], [554.0, 11686.0], [553.0, 12011.0], [552.0, 11282.0], [601.0, 10977.0], [605.0, 6556.0], [596.0, 7179.5], [597.0, 6977.5], [599.0, 11313.0], [598.0, 11675.0], [602.0, 7062.5], [607.0, 10343.0], [595.0, 11835.0], [594.0, 11228.0], [593.0, 10870.0], [606.0, 11201.0], [604.0, 11711.0], [603.0, 11484.0], [600.0, 10919.0], [583.0, 10888.0], [582.0, 11250.0], [581.0, 11284.0], [580.0, 11121.0], [579.0, 11900.0], [578.0, 11209.0], [577.0, 10612.0], [576.0, 11504.0], [591.0, 10885.0], [590.0, 11324.0], [589.0, 11517.0], [588.0, 10389.0], [587.0, 11135.0], [586.0, 11126.0], [585.0, 11278.0], [584.0, 10591.0], [637.0, 11362.0], [608.0, 6980.0], [609.0, 11169.0], [611.0, 11456.0], [610.0, 11287.0], [613.0, 10991.0], [612.0, 10721.0], [623.0, 10889.0], [622.0, 10724.0], [621.0, 11548.0], [620.0, 11531.0], [619.0, 11423.0], [618.0, 10848.0], [617.0, 11215.0], [616.0, 10418.0], [614.0, 6838.5], [627.0, 6408.0], [626.0, 10817.0], [625.0, 10889.0], [624.0, 11050.0], [629.0, 11098.0], [628.0, 11221.0], [631.0, 11286.0], [630.0, 11118.0], [638.0, 6896.0], [639.0, 11119.0], [636.0, 10990.0], [635.0, 10483.0], [634.0, 10761.0], [633.0, 10859.0], [632.0, 10892.0], [615.0, 11582.0], [669.0, 10670.0], [645.0, 6982.0], [640.0, 7146.5], [641.0, 10375.0], [655.0, 10659.0], [653.0, 10589.0], [652.0, 11208.0], [651.0, 10562.0], [650.0, 11262.0], [649.0, 9923.0], [648.0, 11019.0], [642.0, 6888.0], [644.0, 6670.5], [643.0, 10881.0], [660.0, 6659.0], [659.0, 11153.0], [658.0, 10193.0], [657.0, 11201.0], [656.0, 10808.0], [661.0, 11156.0], [663.0, 10948.0], [662.0, 10957.0], [671.0, 10148.0], [670.0, 10368.0], [668.0, 10853.0], [667.0, 10201.0], [666.0, 11095.0], [665.0, 10923.0], [664.0, 10413.0], [647.0, 11236.0], [646.0, 10173.0], [696.0, 6721.0], [677.0, 7047.0], [679.0, 10654.0], [678.0, 10491.0], [687.0, 10836.0], [672.0, 10139.0], [674.0, 10189.0], [673.0, 10333.0], [676.0, 11008.0], [675.0, 10600.0], [682.0, 7015.5], [681.0, 10561.0], [680.0, 10038.0], [683.0, 10316.0], [685.0, 10831.0], [684.0, 10451.0], [686.0, 6908.5], [689.0, 6832.0], [692.0, 6584.5], [691.0, 10457.0], [690.0, 10610.0], [693.0, 10611.0], [695.0, 10795.0], [694.0, 10246.0], [697.0, 5680.666666666666], [698.0, 6531.5], [701.0, 6670.5], [700.0, 10333.0], [699.0, 10695.0], [703.0, 10343.0], [688.0, 10839.0], [702.0, 9589.0], [728.0, 6837.5], [734.0, 9788.0], [714.0, 6488.0], [713.0, 11275.0], [712.0, 10623.0], [715.0, 10594.0], [717.0, 10179.0], [716.0, 10604.0], [719.0, 9936.0], [705.0, 11292.0], [704.0, 9838.0], [707.0, 10589.0], [706.0, 10536.0], [709.0, 10513.0], [708.0, 10546.0], [711.0, 10612.0], [710.0, 10025.0], [718.0, 10569.0], [722.0, 5834.0], [725.0, 6701.5], [724.0, 11110.0], [723.0, 10345.0], [727.0, 10774.0], [733.0, 6923.0], [735.0, 6720.0], [721.0, 10287.0], [720.0, 10472.0], [732.0, 10459.0], [731.0, 10032.0], [730.0, 9888.0], [729.0, 10435.0], [765.0, 6737.5], [743.0, 6907.0], [736.0, 4821.5], [737.0, 10412.0], [738.0, 6922.5], [740.0, 6818.5], [739.0, 10411.0], [742.0, 10403.0], [741.0, 10159.0], [745.0, 3336.0], [744.0, 10380.0], [746.0, 10362.0], [748.0, 9952.0], [747.0, 10353.0], [750.0, 10337.0], [749.0, 10351.0], [751.0, 10172.0], [752.0, 6862.5], [753.0, 10277.0], [755.0, 10829.0], [754.0, 10896.0], [757.0, 11760.0], [756.0, 10246.0], [759.0, 9636.0], [758.0, 10121.0], [761.0, 6748.5], [760.0, 10200.0], [762.0, 9990.0], [764.0, 9916.0], [763.0, 9916.0], [767.0, 6671.5], [766.0, 10043.0], [774.0, 6729.0], [769.0, 5392.0], [768.0, 6728.5], [772.0, 7269.5], [771.0, 10096.0], [770.0, 10139.0], [773.0, 9910.0], [780.0, 6810.0], [779.0, 9999.0], [778.0, 10035.0], [777.0, 10695.0], [776.0, 10600.0], [782.0, 10002.0], [781.0, 9527.0], [783.0, 6674.0], [799.0, 10555.0], [784.0, 10676.0], [786.0, 9962.0], [785.0, 9987.0], [788.0, 9960.0], [787.0, 10585.0], [790.0, 9946.0], [789.0, 9965.0], [797.0, 9783.0], [796.0, 9785.0], [795.0, 9899.0], [794.0, 10594.0], [793.0, 10425.0], [792.0, 10080.5], [775.0, 10045.0], [829.0, 9467.0], [807.0, 7298.5], [802.0, 6623.5], [801.0, 7539.5], [800.0, 10571.0], [815.0, 9703.0], [814.0, 10383.0], [806.0, 6448.0], [805.0, 9677.0], [804.0, 10385.0], [803.0, 9830.0], [810.0, 6715.0], [809.0, 9800.0], [808.0, 9780.0], [812.0, 9738.0], [811.0, 9740.0], [813.0, 6688.5], [818.0, 6601.5], [817.0, 9746.0], [816.0, 9707.0], [819.0, 10560.0], [821.0, 9677.0], [820.0, 9686.0], [823.0, 9673.0], [822.0, 9673.0], [825.0, 6635.0], [824.0, 9691.0], [826.0, 9644.0], [828.0, 10209.0], [827.0, 9673.0], [830.0, 10222.0], [831.0, 10532.0], [839.0, 7662.0], [835.0, 6568.0], [833.0, 7264.0], [832.0, 9545.0], [834.0, 9603.0], [837.0, 7001.0], [836.0, 9540.0], [838.0, 9545.0], [847.0, 5902.0], [846.0, 5541.333333333333], [845.0, 11575.0], [844.0, 10046.0], [843.0, 10033.0], [842.0, 9488.0], [841.0, 9506.0], [840.0, 10107.0], [848.0, 6279.0], [850.0, 9007.0], [849.0, 10105.0], [852.0, 9451.0], [851.0, 9440.0], [860.0, 4905.5], [859.0, 9356.0], [857.0, 9395.0], [856.0, 9352.0], [862.0, 9314.0], [861.0, 9336.0], [863.0, 9294.0], [854.0, 6320.0], [855.0, 9893.0], [853.0, 6098.0], [889.0, 5288.0], [869.0, 7355.0], [867.0, 8039.666666666667], [865.0, 9324.0], [864.0, 9198.0], [868.0, 9851.0], [870.0, 6328.0], [888.0, 9727.0], [871.0, 9282.0], [894.0, 5841.666666666667], [893.0, 9994.0], [892.0, 8923.0], [891.0, 9622.0], [890.0, 10113.0], [895.0, 5835.0], [880.0, 9797.0], [874.0, 6096.5], [873.0, 9250.0], [872.0, 10749.0], [876.0, 9127.0], [875.0, 9985.0], [878.0, 9165.0], [877.0, 9172.0], [879.0, 7232.5], [881.0, 6452.0], [885.0, 6750.5], [887.0, 9931.0], [886.0, 8991.0], [884.0, 5885.0], [883.0, 6838.5], [882.0, 10981.0], [921.0, 7315.5], [911.0, 5622.666666666666], [898.0, 6737.5], [897.0, 9477.0], [896.0, 8837.0], [900.0, 8822.0], [899.0, 9438.0], [902.0, 9746.0], [901.0, 10874.0], [920.0, 10893.0], [903.0, 6070.0], [905.0, 5053.333333333333], [904.0, 8825.0], [906.0, 8789.0], [908.0, 9671.0], [907.0, 8799.0], [909.0, 6587.0], [910.0, 7000.0], [912.0, 4185.0], [919.0, 7113.5], [918.0, 5976.5], [917.0, 9513.0], [916.0, 9287.0], [915.0, 9453.0], [914.0, 9575.0], [913.0, 10064.0], [927.0, 9873.0], [926.0, 10305.0], [925.0, 9799.0], [924.0, 10866.0], [923.0, 8711.0], [922.0, 10062.0], [954.0, 6051.666666666667], [946.0, 5578.0], [931.0, 5462.333333333333], [930.0, 9166.0], [929.0, 8552.0], [928.0, 9711.0], [932.0, 4923.25], [934.0, 6437.5], [933.0, 8856.0], [935.0, 8752.0], [953.0, 5744.5], [952.0, 4464.12], [956.0, 5538.75], [955.0, 9159.0], [959.0, 5440.333333333333], [945.0, 9889.0], [944.0, 10237.0], [957.0, 5925.0], [943.0, 6293.5], [942.0, 9085.0], [941.0, 8530.0], [940.0, 10097.0], [939.0, 9497.0], [938.0, 8361.0], [937.0, 9448.0], [936.0, 9639.0], [947.0, 6321.5], [948.0, 4689.8], [949.0, 3731.75], [950.0, 7603.333333333333], [951.0, 5246.25], [988.0, 9799.0], [961.0, 6584.5], [960.0, 4997.2], [975.0, 8769.0], [974.0, 8439.0], [973.0, 9744.0], [972.0, 8400.0], [971.0, 8342.0], [970.0, 9778.0], [969.0, 8312.0], [968.0, 8913.0], [984.0, 5906.5], [967.0, 8707.0], [966.0, 8268.0], [965.0, 8703.0], [964.0, 9427.0], [963.0, 8396.0], [962.0, 9357.0], [985.0, 8287.0], [991.0, 7885.0], [977.0, 8813.0], [976.0, 9126.0], [979.0, 9919.0], [978.0, 8245.0], [981.0, 9489.0], [980.0, 8091.0], [983.0, 9761.0], [982.0, 8408.0], [990.0, 8604.0], [989.0, 8520.0], [987.0, 8413.0], [986.0, 8302.0], [1017.0, 6508.5], [992.0, 6378.5], [993.0, 9082.0], [995.0, 8735.0], [994.0, 8730.0], [997.0, 7777.0], [996.0, 8304.0], [1007.0, 7989.0], [1006.0, 7865.0], [1005.0, 8891.0], [1004.0, 7910.0], [1003.0, 9641.0], [1002.0, 9009.0], [1001.0, 8003.0], [1000.0, 9805.0], [998.0, 6718.0], [1016.0, 6194.5], [999.0, 7976.0], [1018.0, 6700.5], [1020.0, 5585.333333333333], [1021.0, 8531.0], [1019.0, 6083.5], [1023.0, 6402.5], [1008.0, 8067.0], [1010.0, 9433.0], [1009.0, 9003.0], [1012.0, 8551.0], [1011.0, 8040.0], [1015.0, 9298.0], [1014.0, 8552.5], [1022.0, 8952.0], [1028.0, 5521.0], [1024.0, 5430.0], [1046.0, 6090.5], [1048.0, 9269.0], [1050.0, 5892.666666666667], [1052.0, 6311.0], [1054.0, 6088.333333333333], [1044.0, 5180.2], [1042.0, 5687.5], [1040.0, 5040.0], [1026.0, 7825.0], [1032.0, 5386.8], [1030.0, 6058.5], [1034.0, 6415.5], [1036.0, 6779.5], [1072.0, 8221.0], [1074.0, 7476.0], [1076.0, 8650.0], [1078.0, 6302.666666666667], [1080.0, 4933.0], [1082.0, 7754.0], [1084.0, 8745.0], [1086.0, 6601.5], [1058.0, 7629.5], [1062.0, 7026.666666666667], [1060.0, 9139.0], [1064.0, 6179.0], [1066.0, 5310.0], [1068.0, 8007.0], [1070.0, 8105.0], [1056.0, 5330.8], [1038.0, 6840.0], [1092.0, 6025.5], [1088.0, 8997.0], [1116.0, 7990.0], [1118.0, 5799.0], [1114.0, 5853.5], [1112.0, 6132.0], [1110.0, 4108.0], [1108.0, 7184.0], [1106.0, 6398.666666666667], [1104.0, 6076.666666666667], [1090.0, 6144.333333333333], [1096.0, 7222.0], [1094.0, 7126.0], [1102.0, 5597.666666666667], [1120.0, 7522.0], [1150.0, 5733.5], [1146.0, 7195.0], [1144.0, 7716.0], [1142.0, 5910.333333333333], [1140.0, 6265.5], [1136.0, 6471.5], [1138.0, 5796.75], [1122.0, 6777.5], [1128.0, 6051.5], [1130.0, 5429.166666666667], [1132.0, 6126.333333333333], [1134.0, 5080.125], [1126.0, 6245.333333333333], [1124.0, 6197.5], [1100.0, 6700.0], [1098.0, 5541.0], [1158.0, 5998.5], [1154.0, 6180.75], [1152.0, 6998.0], [1156.0, 7791.0], [1180.0, 7518.0], [1182.0, 7610.0], [1178.0, 5652.0], [1176.0, 6996.0], [1174.0, 5900.0], [1164.0, 6650.5], [1162.0, 8322.0], [1160.0, 8307.0], [1166.0, 7403.0], [1184.0, 7214.0], [1186.0, 7786.0], [1188.0, 7307.0], [1190.0, 7708.0], [1192.0, 7968.0], [1194.0, 6417.0], [1196.0, 7221.0], [1198.0, 6865.0], [1214.0, 7624.0], [1212.0, 6467.0], [1210.0, 7835.0], [1208.0, 7337.0], [1206.0, 6476.0], [1204.0, 9558.0], [1202.0, 7516.0], [1200.0, 6533.0], [1168.0, 5154.142857142858], [1170.0, 8339.0], [1172.0, 5345.166666666667], [1272.0, 6073.0], [1268.0, 7776.0], [1276.0, 6644.0], [1248.0, 7137.0], [1250.0, 7138.0], [1252.0, 6097.0], [1254.0, 7909.0], [1256.0, 7383.0], [1258.0, 7464.0], [1260.0, 7629.0], [1262.0, 6918.0], [1278.0, 6678.0], [1274.0, 6476.0], [1270.0, 5958.0], [1266.0, 7016.0], [1264.0, 7051.0], [1216.0, 6936.0], [1218.0, 7223.0], [1220.0, 6151.0], [1224.0, 8030.0], [1226.0, 7007.0], [1228.0, 7129.0], [1230.0, 6305.0], [1244.0, 6706.0], [1242.0, 7285.0], [1240.0, 7546.0], [1238.0, 7127.0], [1236.0, 7723.0], [1234.0, 6247.0], [1232.0, 7239.0], [1336.0, 5828.0], [1332.0, 6042.8], [1340.0, 6011.333333333333], [1312.0, 7351.0], [1314.0, 7305.0], [1316.0, 6027.0], [1318.0, 5636.0], [1320.0, 5877.0], [1322.0, 5814.0], [1324.0, 6432.0], [1326.0, 8527.0], [1342.0, 6481.333333333333], [1338.0, 6320.333333333333], [1334.0, 6252.5], [1330.0, 6878.5], [1328.0, 6545.5], [1280.0, 6379.0], [1282.0, 6660.0], [1284.0, 6693.0], [1286.0, 5797.0], [1288.0, 6508.0], [1290.0, 6006.0], [1292.0, 7422.0], [1294.0, 5708.0], [1310.0, 7204.0], [1308.0, 7248.0], [1306.0, 5772.0], [1304.0, 6693.0], [1302.0, 7338.0], [1300.0, 7266.0], [1298.0, 6115.0], [1296.0, 5677.0], [1346.0, 6280.333333333333], [1344.0, 6171.666666666667], [1374.0, 7620.0], [1372.0, 5716.0], [1370.0, 6587.0], [1368.0, 5512.666666666667], [1364.0, 7891.0], [1362.0, 7917.0], [1366.0, 7427.5], [1360.0, 6079.0], [1348.0, 6283.0], [1352.0, 6489.0], [1350.0, 7227.0], [1354.0, 6469.0], [1356.0, 5931.0], [1358.0, 6664.0], [1392.0, 5916.0], [1394.0, 5253.5], [1398.0, 5071.0], [1396.0, 6422.0], [1400.0, 6045.0], [1402.0, 5854.0], [1376.0, 7019.0], [1378.0, 5326.0], [1406.0, 5261.0], [1404.0, 5646.0], [1380.0, 5397.0], [1384.0, 6038.0], [1382.0, 5861.0], [1386.0, 6264.0], [1388.0, 5671.2], [1390.0, 5441.0], [1410.0, 6013.0], [1408.0, 5646.0], [1412.0, 5471.0], [1418.0, 5368.5], [1422.0, 6123.0], [1420.0, 5703.0], [1414.0, 5251.0], [1027.0, 5345.0], [1035.0, 6902.0], [1031.0, 5652.75], [1041.0, 5062.333333333333], [1043.0, 5440.25], [1045.0, 5731.666666666667], [1047.0, 8135.0], [1049.0, 6208.333333333333], [1053.0, 6806.0], [1055.0, 5475.666666666667], [1051.0, 6595.0], [1029.0, 4769.222222222223], [1025.0, 8619.0], [1033.0, 6776.0], [1037.0, 6960.5], [1039.0, 5275.166666666666], [1073.0, 6976.0], [1075.0, 6111.333333333333], [1077.0, 6454.5], [1081.0, 5330.333333333333], [1083.0, 5869.0], [1085.0, 5190.666666666667], [1087.0, 8582.0], [1079.0, 5561.0], [1057.0, 4324.5], [1059.0, 6542.0], [1063.0, 7675.0], [1065.0, 7500.0], [1067.0, 5738.0], [1069.0, 6840.5], [1071.0, 7618.0], [1091.0, 6535.5], [1089.0, 5621.0], [1119.0, 7809.0], [1117.0, 5842.5], [1115.0, 8297.0], [1113.0, 5307.6], [1111.0, 6750.666666666667], [1109.0, 7402.0], [1107.0, 5770.5], [1105.0, 6628.5], [1097.0, 7447.0], [1095.0, 7011.5], [1093.0, 8342.0], [1099.0, 6751.0], [1101.0, 5440.666666666667], [1121.0, 6025.0], [1149.0, 6999.0], [1147.0, 7667.0], [1145.0, 7817.0], [1143.0, 7234.0], [1151.0, 6581.0], [1141.0, 5994.333333333333], [1139.0, 5839.0], [1103.0, 8705.0], [1137.0, 5243.0], [1123.0, 6219.5], [1125.0, 5884.666666666667], [1127.0, 5586.666666666667], [1131.0, 7064.0], [1133.0, 7175.0], [1135.0, 5493.571428571428], [1129.0, 6574.0], [1167.0, 7104.5], [1157.0, 5650.0], [1155.0, 7019.0], [1179.0, 5908.75], [1181.0, 7798.0], [1183.0, 7267.0], [1177.0, 6495.5], [1175.0, 6786.5], [1159.0, 6285.0], [1163.0, 6725.0], [1161.0, 7471.0], [1165.0, 6943.0], [1215.0, 6834.0], [1185.0, 8090.0], [1187.0, 7276.0], [1189.0, 7639.0], [1191.0, 7053.0], [1193.0, 8167.0], [1195.0, 6477.0], [1197.0, 7448.0], [1199.0, 7490.0], [1213.0, 7598.0], [1211.0, 7370.0], [1209.0, 6838.0], [1205.0, 7394.0], [1203.0, 8129.0], [1201.0, 8011.0], [1169.0, 6998.0], [1173.0, 5504.000000000001], [1171.0, 5401.2], [1277.0, 6097.0], [1279.0, 6508.0], [1249.0, 7835.0], [1251.0, 7738.0], [1253.0, 7455.0], [1255.0, 7536.0], [1257.0, 7149.0], [1259.0, 6207.0], [1261.0, 6118.0], [1263.0, 7240.0], [1275.0, 7664.0], [1273.0, 6814.0], [1271.0, 6083.0], [1269.0, 7240.0], [1267.0, 6847.0], [1265.0, 6986.0], [1247.0, 6625.0], [1217.0, 8055.0], [1219.0, 6388.0], [1223.0, 6705.5], [1221.0, 7202.0], [1225.0, 7853.0], [1227.0, 8050.0], [1229.0, 7054.0], [1231.0, 7033.0], [1245.0, 6503.0], [1243.0, 7545.0], [1241.0, 6543.0], [1239.0, 7873.0], [1235.0, 7561.0], [1233.0, 7074.0], [1341.0, 6452.666666666667], [1343.0, 6611.333333333333], [1313.0, 6138.0], [1315.0, 8786.0], [1317.0, 8709.0], [1319.0, 7068.0], [1321.0, 7407.0], [1323.0, 6369.0], [1325.0, 6631.0], [1327.0, 7019.5], [1339.0, 6219.0], [1337.0, 5882.5], [1335.0, 5898.333333333333], [1333.0, 5911.333333333333], [1331.0, 6094.6], [1329.0, 7173.333333333333], [1311.0, 8581.0], [1283.0, 5962.0], [1285.0, 6899.0], [1287.0, 7309.0], [1289.0, 7378.0], [1291.0, 7468.0], [1293.0, 7276.0], [1295.0, 6882.0], [1309.0, 7071.0], [1307.0, 6165.0], [1305.0, 7236.0], [1303.0, 7319.0], [1301.0, 6814.0], [1299.0, 6285.0], [1297.0, 8961.0], [1349.0, 5784.666666666667], [1347.0, 5815.8], [1345.0, 5949.2], [1375.0, 5955.0], [1373.0, 6697.0], [1371.0, 6221.5], [1369.0, 5733.0], [1365.0, 5679.0], [1363.0, 8015.0], [1367.0, 6328.333333333333], [1361.0, 6473.2], [1351.0, 7371.0], [1353.0, 5497.0], [1355.0, 6118.0], [1357.0, 6614.5], [1359.0, 6878.0], [1393.0, 6092.5], [1399.0, 5539.5], [1397.0, 6849.0], [1395.0, 7086.0], [1401.0, 6000.0], [1407.0, 6001.0], [1377.0, 6954.0], [1379.0, 5379.0], [1405.0, 5047.0], [1403.0, 4846.0], [1385.0, 6329.333333333333], [1383.0, 6317.0], [1381.0, 6604.0], [1387.0, 5255.0], [1391.0, 5483.5], [1389.0, 5126.0], [1411.0, 5802.0], [1419.0, 5678.0], [1409.0, 4525.0], [1415.0, 5663.5], [1421.0, 5944.5], [1417.0, 5743.0], [1413.0, 5248.0], [1.0, 13516.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[778.7239999999985, 8453.888499999997]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1422.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 12500.0, "minX": 1.54960806E12, "maxY": 14031.816666666668, "series": [{"data": [[1.54960806E12, 14031.816666666668]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960806E12, 12500.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 8453.888499999997, "minX": 1.54960806E12, "maxY": 8453.888499999997, "series": [{"data": [[1.54960806E12, 8453.888499999997]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 8453.878499999992, "minX": 1.54960806E12, "maxY": 8453.878499999992, "series": [{"data": [[1.54960806E12, 8453.878499999992]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 98.96350000000008, "minX": 1.54960806E12, "maxY": 98.96350000000008, "series": [{"data": [[1.54960806E12, 98.96350000000008]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 288.0, "minX": 1.54960806E12, "maxY": 14117.0, "series": [{"data": [[1.54960806E12, 14117.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960806E12, 288.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960806E12, 12873.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960806E12, 13812.89]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960806E12, 13448.8]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 8768.0, "minX": 33.0, "maxY": 8768.0, "series": [{"data": [[33.0, 8768.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 8768.0, "minX": 33.0, "maxY": 8768.0, "series": [{"data": [[33.0, 8768.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960806E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960806E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960806E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960806E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960806E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960806E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
